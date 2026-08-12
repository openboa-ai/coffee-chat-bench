import { stableDigest } from "./digest.ts";
import {
  DEFAULT_JUDGE_CAMPAIGN_CONFIG,
  loadJudgeCampaignConfig,
  parseJudgeCampaignConfig,
  type JudgeCampaignConfig,
  type JudgeModel,
} from "./judge-config.ts";
import {
  canonicalResponseDigest,
  parseJudgeDimensions,
  runJudgePanel,
  type JudgePanelInput,
  type JudgePanelResult,
} from "./judge-panel.ts";
import type {
  JudgeTransport,
  JudgeTransportResponse,
  JudgeUsage,
} from "./openai-judge.ts";

export {
  loadJudgeCampaignConfig,
  parseJudgeCampaignConfig,
} from "./judge-config.ts";

export const JUDGE_CAMPAIGN_CAP_NANO_USD =
  DEFAULT_JUDGE_CAMPAIGN_CONFIG.campaignCapNanoUsd;

export interface JudgeCampaignManifest {
  atomCount: number;
  maxInputTokensPerRequest: number;
  maxOutputTokensPerRequest: number;
}

export interface JudgeCampaignReceipt {
  atomId: string;
  slot: JudgeModel;
  attempt: number;
  requestedModel: JudgeModel;
  resolvedModel?: string;
  promptDigest: string;
  responseDigest?: string;
  usage?: JudgeUsage;
  reservedNanoUsd: number;
  settledNanoUsd?: number;
  remainingBudgetNanoUsd: number;
  terminalState: "response" | "provider_error";
  budgetStopReason?: "usage_invalid";
  judgeConfigDigest: string;
  tariffDigest: string;
  campaignDigest: string;
}

export interface JudgeCampaignResult {
  state: "preflight_rejected" | "budget_stopped" | "completed";
  panels: JudgePanelResult[];
  receipts: JudgeCampaignReceipt[];
  plannedWorstCaseNanoUsd: number;
  settledNanoUsd: number;
  outstandingReservationNanoUsd: number;
  remainingBudgetNanoUsd: number;
  budgetStopReason?:
    | "atom_count_mismatch"
    | "invalid_manifest"
    | "request_too_large"
    | "planned_cost_exceeds_cap"
    | "usage_invalid";
}

interface Accounting {
  settledNanoUsd: number;
  outstandingReservationNanoUsd: number;
  stopped: boolean;
  budgetStopReason?: "usage_invalid";
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validManifest(manifest: JudgeCampaignManifest): boolean {
  return [
    manifest.atomCount,
    manifest.maxInputTokensPerRequest,
    manifest.maxOutputTokensPerRequest,
  ].every((value) => isNonNegativeSafeInteger(value) && value > 0);
}

function tariffNanoUsdPerToken(
  config: JudgeCampaignConfig,
  model: JudgeModel,
): { input: number; output: number } {
  const tariff = config.tariffSnapshot.models[model];
  if (!tariff) throw new TypeError(`missing tariff for ${model}`);
  const input = tariff.inputUsd * 1_000;
  const output = tariff.outputUsd * 1_000;
  if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output)) {
    throw new TypeError(`tariff for ${model} cannot use integer nano-USD`);
  }
  return { input, output };
}

function charge(
  config: JudgeCampaignConfig,
  model: JudgeModel,
  inputTokens: number,
  outputTokens: number,
): number {
  const tariff = tariffNanoUsdPerToken(config, model);
  return inputTokens * tariff.input + outputTokens * tariff.output;
}

function maximumCharge(
  config: JudgeCampaignConfig,
  model: JudgeModel,
  manifest: JudgeCampaignManifest,
): number {
  return charge(
    config,
    model,
    manifest.maxInputTokensPerRequest,
    manifest.maxOutputTokensPerRequest,
  );
}

function parseUsage(
  value: unknown,
  manifest: JudgeCampaignManifest,
): JudgeUsage | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const usage = value as Record<string, unknown>;
  if (
    !isNonNegativeSafeInteger(usage.inputTokens) ||
    !isNonNegativeSafeInteger(usage.outputTokens)
  )
    return undefined;
  if (
    usage.inputTokens > manifest.maxInputTokensPerRequest ||
    usage.outputTokens > manifest.maxOutputTokensPerRequest
  )
    return undefined;
  const cached = usage.cachedInputTokens;
  const reasoning = usage.reasoningTokens;
  if (
    cached !== undefined &&
    (!isNonNegativeSafeInteger(cached) || cached > usage.inputTokens)
  )
    return undefined;
  if (
    reasoning !== undefined &&
    (!isNonNegativeSafeInteger(reasoning) || reasoning > usage.outputTokens)
  )
    return undefined;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    ...(cached === undefined ? {} : { cachedInputTokens: cached }),
    ...(reasoning === undefined ? {} : { reasoningTokens: reasoning }),
  };
}

function responseDetails(response: JudgeTransportResponse): {
  resolvedModel?: string;
  responseDigest?: string;
} {
  if (response.state !== "response") return {};
  const body = response.body;
  const parsed = parseJudgeDimensions(body);
  return {
    resolvedModel: response.resolvedModel,
    responseDigest: canonicalResponseDigest(body, parsed),
  };
}

class BudgetedTransport implements JudgeTransport {
  readonly receipts: JudgeCampaignReceipt[] = [];
  private readonly atomId: string;
  private readonly manifest: JudgeCampaignManifest;
  private readonly config: JudgeCampaignConfig;
  private readonly transport: JudgeTransport;
  private readonly accounting: Accounting;
  private readonly digests: {
    judgeConfigDigest: string;
    tariffDigest: string;
    campaignDigest: string;
  };

  constructor(
    atomId: string,
    manifest: JudgeCampaignManifest,
    config: JudgeCampaignConfig,
    transport: JudgeTransport,
    accounting: Accounting,
    digests: {
      judgeConfigDigest: string;
      tariffDigest: string;
      campaignDigest: string;
    },
  ) {
    this.atomId = atomId;
    this.manifest = manifest;
    this.config = config;
    this.transport = transport;
    this.accounting = accounting;
    this.digests = digests;
  }

  stopRequested(): boolean {
    return this.accounting.stopped;
  }

  stopReason(): "usage_invalid" | undefined {
    return this.accounting.budgetStopReason;
  }

  async request(
    request: Parameters<JudgeTransport["request"]>[0],
  ): Promise<JudgeTransportResponse> {
    if (this.accounting.stopped) {
      return { state: "budget_stopped", reason: "usage_invalid" };
    }
    const boundedRequest = {
      ...request,
      maxOutputTokens: this.manifest.maxOutputTokensPerRequest,
    };
    const reservedNanoUsd = maximumCharge(
      this.config,
      boundedRequest.model,
      this.manifest,
    );
    this.accounting.outstandingReservationNanoUsd += reservedNanoUsd;
    const attempt =
      this.receipts.filter((receipt) => receipt.slot === boundedRequest.model)
        .length + 1;
    const promptDigest = stableDigest({
      model: boundedRequest.model,
      prompt: boundedRequest.prompt,
    });
    let response: JudgeTransportResponse;
    try {
      response = await this.transport.request(boundedRequest);
    } catch {
      response = { state: "provider_error" };
    }
    if (response.state === "budget_stopped") {
      this.accounting.stopped = true;
      this.accounting.budgetStopReason = response.reason;
      return response;
    }
    const usage =
      response.state === "response"
        ? parseUsage(response.usage, this.manifest)
        : undefined;
    const details = responseDetails(response);
    const receipt: JudgeCampaignReceipt = {
      atomId: this.atomId,
      slot: boundedRequest.model,
      attempt,
      requestedModel: boundedRequest.model,
      promptDigest,
      reservedNanoUsd,
      remainingBudgetNanoUsd:
        this.config.campaignCapNanoUsd -
        this.accounting.settledNanoUsd -
        this.accounting.outstandingReservationNanoUsd,
      terminalState: response.state,
      judgeConfigDigest: this.digests.judgeConfigDigest,
      tariffDigest: this.digests.tariffDigest,
      campaignDigest: this.digests.campaignDigest,
      ...details,
    };
    if (!usage) {
      this.accounting.stopped = true;
      this.accounting.budgetStopReason = "usage_invalid";
      receipt.budgetStopReason = "usage_invalid";
      this.receipts.push(receipt);
      return { state: "budget_stopped", reason: "usage_invalid" };
    }
    const settledNanoUsd = charge(
      this.config,
      boundedRequest.model,
      usage.inputTokens,
      usage.outputTokens,
    );
    if (settledNanoUsd > reservedNanoUsd) {
      this.accounting.stopped = true;
      this.accounting.budgetStopReason = "usage_invalid";
      receipt.usage = usage;
      receipt.budgetStopReason = "usage_invalid";
      this.receipts.push(receipt);
      return { state: "budget_stopped", reason: "usage_invalid" };
    }
    this.accounting.outstandingReservationNanoUsd -= reservedNanoUsd;
    this.accounting.settledNanoUsd += settledNanoUsd;
    receipt.usage = usage;
    receipt.settledNanoUsd = settledNanoUsd;
    receipt.remainingBudgetNanoUsd =
      this.config.campaignCapNanoUsd -
      this.accounting.settledNanoUsd -
      this.accounting.outstandingReservationNanoUsd;
    this.receipts.push(receipt);
    return response;
  }
}

export async function runJudgeCampaign(
  atoms: readonly JudgePanelInput[],
  manifest: JudgeCampaignManifest,
  transport: JudgeTransport,
  config: JudgeCampaignConfig = loadJudgeCampaignConfig(),
): Promise<JudgeCampaignResult> {
  config = parseJudgeCampaignConfig(config);
  const plannedWorstCaseNanoUsd =
    manifest.atomCount *
    config.models.reduce(
      (total, model) =>
        total +
        config.requestsPerModel *
          (config.malformedRetries + 1) *
          maximumCharge(config, model, manifest),
      0,
    );
  const empty = (
    state: JudgeCampaignResult["state"],
    budgetStopReason?: JudgeCampaignResult["budgetStopReason"],
  ): JudgeCampaignResult => ({
    state,
    panels: [],
    receipts: [],
    plannedWorstCaseNanoUsd,
    settledNanoUsd: 0,
    outstandingReservationNanoUsd: 0,
    remainingBudgetNanoUsd: config.campaignCapNanoUsd,
    ...(budgetStopReason === undefined ? {} : { budgetStopReason }),
  });
  if (!validManifest(manifest))
    return empty("preflight_rejected", "invalid_manifest");
  if (atoms.length !== manifest.atomCount)
    return empty("preflight_rejected", "atom_count_mismatch");
  if (
    atoms.some(
      (atom) =>
        Buffer.byteLength(
          JSON.stringify({ atomId: atom.atomId, instruction: atom.prompt }),
          "utf8",
        ) > manifest.maxInputTokensPerRequest,
    )
  ) {
    return empty("preflight_rejected", "request_too_large");
  }
  if (
    !Number.isSafeInteger(plannedWorstCaseNanoUsd) ||
    plannedWorstCaseNanoUsd > config.campaignCapNanoUsd
  ) {
    return empty("preflight_rejected", "planned_cost_exceeds_cap");
  }
  const accounting: Accounting = {
    settledNanoUsd: 0,
    outstandingReservationNanoUsd: 0,
    stopped: false,
  };
  const panels: JudgePanelResult[] = [];
  const receipts: JudgeCampaignReceipt[] = [];
  const digests = {
    judgeConfigDigest: stableDigest(config),
    tariffDigest: stableDigest(config.tariffSnapshot),
    campaignDigest: stableDigest(manifest),
  };
  for (const atom of atoms) {
    const budgeted = new BudgetedTransport(
      atom.atomId,
      manifest,
      config,
      transport,
      accounting,
      digests,
    );
    panels.push(await runJudgePanel(atom, budgeted, config));
    receipts.push(...budgeted.receipts);
  }
  return {
    state: accounting.stopped ? "budget_stopped" : "completed",
    panels,
    receipts,
    plannedWorstCaseNanoUsd,
    settledNanoUsd: accounting.settledNanoUsd,
    outstandingReservationNanoUsd: accounting.outstandingReservationNanoUsd,
    remainingBudgetNanoUsd:
      config.campaignCapNanoUsd -
      accounting.settledNanoUsd -
      accounting.outstandingReservationNanoUsd,
    ...(accounting.budgetStopReason === undefined
      ? {}
      : { budgetStopReason: accounting.budgetStopReason }),
  };
}

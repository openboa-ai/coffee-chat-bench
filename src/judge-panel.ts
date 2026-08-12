import { stableDigest } from "./digest.ts";
import {
  RELEASE_ID,
  type JudgeVote as PublicJudgeVote,
  type QualificationDimensions,
  type ResultState,
} from "./contracts.ts";
import {
  DEFAULT_JUDGE_CAMPAIGN_CONFIG,
  type JudgeCampaignConfig,
  type JudgeModel,
} from "./judge-config.ts";
import type { JudgeTransport } from "./openai-judge.ts";

export type { JudgeTransport } from "./openai-judge.ts";

interface VoteProvenance {
  requestedModel: JudgeModel;
  resolvedModel?: string;
  promptDigest: string;
  responseDigest?: string;
  attemptCount: number;
}

export type JudgeVote =
  | (VoteProvenance & {
      state: "valid";
      resolvedModel: string;
      responseDigest: string;
      pass: boolean;
      criticalFailure: boolean;
      dimensions: QualificationDimensions;
    })
  | (VoteProvenance & {
      state:
        | "malformed"
        | "provider_error"
        | "model_drift"
        | "unavailable"
        | "budget_stopped";
      budgetStopReason?: "usage_invalid";
    });

export interface JudgeConsensus {
  state:
    | "pass"
    | "fail"
    | "tie"
    | "insufficient_votes"
    | "critical_failure"
    | "deterministic_failure";
  validVotes: number;
  passVotes: number;
  criticalFailureVotes: number;
  pass?: boolean;
  criticalDisagreement: boolean;
}

export interface JudgePanelInput {
  atomId: string;
  prompt: string;
  deterministicVerifierPassed: boolean;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface JudgePanelResult {
  votes: JudgeVote[];
  consensus: JudgeConsensus;
  panelDigest: string;
}

export function parseJudgeDimensions(
  body: unknown,
): QualificationDimensions | undefined {
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.getPrototypeOf(body) !== Object.prototype
  ) {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  const keys = [
    "taskAdequate",
    "evidenceIntegrity",
    "perspectiveAligned",
    "invariantsPreserved",
    "criticalFailure",
  ] as const;
  if (
    Object.keys(record).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(record, key))
  ) {
    return undefined;
  }
  for (const key of keys) {
    if (typeof record[key] !== "boolean") return undefined;
  }
  return {
    taskAdequate: record.taskAdequate as boolean,
    evidenceIntegrity: record.evidenceIntegrity as boolean,
    perspectiveAligned: record.perspectiveAligned as boolean,
    invariantsPreserved: record.invariantsPreserved as boolean,
    criticalFailure: record.criticalFailure as boolean,
  };
}

function dimensionsPass(dimensions: QualificationDimensions): boolean {
  return (
    dimensions.taskAdequate &&
    dimensions.evidenceIntegrity &&
    dimensions.perspectiveAligned &&
    dimensions.invariantsPreserved &&
    !dimensions.criticalFailure
  );
}

function sameDimensions(
  left: QualificationDimensions,
  right: QualificationDimensions,
): boolean {
  return (
    left.taskAdequate === right.taskAdequate &&
    left.evidenceIntegrity === right.evidenceIntegrity &&
    left.perspectiveAligned === right.perspectiveAligned &&
    left.invariantsPreserved === right.invariantsPreserved &&
    left.criticalFailure === right.criticalFailure
  );
}

const SENSITIVE_KEY =
  /(?:api.?key|authorization|credential|password|secret|token)/i;
const UNSTABLE_KEY = /(?:timestamp|created(?:_at)?|updated(?:_at)?|time)$/i;

function sanitizedMalformedBody(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : "[non-finite]";
  if (Array.isArray(value)) return value.map(sanitizedMalformedBody);
  if (typeof value !== "object") return `[${typeof value}]`;
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (SENSITIVE_KEY.test(key) || UNSTABLE_KEY.test(key)) continue;
    result[key] = sanitizedMalformedBody(nested);
  }
  return result;
}

export function canonicalResponseDigest(
  body: unknown,
  parsed: QualificationDimensions | undefined,
): string {
  return stableDigest(parsed ?? sanitizedMalformedBody(body));
}

export function aggregateJudgeVotes(
  votes: readonly JudgeVote[],
  models: readonly JudgeModel[] = DEFAULT_JUDGE_CAMPAIGN_CONFIG.models,
): JudgeConsensus {
  const valid = votes.filter(
    (vote): vote is Extract<JudgeVote, { state: "valid" }> =>
      vote.state === "valid",
  );
  const passVotes = valid.filter((vote) => vote.pass).length;
  const criticalFailureVotes = valid.filter(
    (vote) => vote.criticalFailure,
  ).length;
  const coversBothSlots = models.every((model) =>
    valid.some((vote) => vote.requestedModel === model),
  );
  const base = { validVotes: valid.length, passVotes, criticalFailureVotes };
  if (valid.length !== 2 || !coversBothSlots) {
    return {
      state: "insufficient_votes",
      ...base,
      criticalDisagreement: false,
    };
  }
  if (criticalFailureVotes === 2) {
    return {
      state: "critical_failure",
      ...base,
      pass: false,
      criticalDisagreement: false,
    };
  }
  if (criticalFailureVotes === 1) {
    return { state: "tie", ...base, criticalDisagreement: true };
  }
  if (!sameDimensions(valid[0]!.dimensions, valid[1]!.dimensions)) {
    return { state: "tie", ...base, criticalDisagreement: false };
  }
  if (passVotes === 2)
    return { state: "pass", ...base, pass: true, criticalDisagreement: false };
  if (passVotes === 0)
    return { state: "fail", ...base, pass: false, criticalDisagreement: false };
  return { state: "tie", ...base, criticalDisagreement: false };
}

function stopped(transport: JudgeTransport): boolean {
  return transport.stopRequested?.() === true;
}

function stoppedVote(
  model: JudgeModel,
  promptDigest: string,
  attemptCount: number,
  transport: JudgeTransport,
): JudgeVote {
  return {
    state: "budget_stopped",
    requestedModel: model,
    promptDigest,
    attemptCount,
    budgetStopReason: transport.stopReason?.() ?? "usage_invalid",
  };
}

export async function runJudgePanel(
  input: JudgePanelInput,
  transport: JudgeTransport,
  config: JudgeCampaignConfig = DEFAULT_JUDGE_CAMPAIGN_CONFIG,
): Promise<JudgePanelResult> {
  if (!input.deterministicVerifierPassed) {
    const consensus: JudgeConsensus = {
      state: "deterministic_failure",
      validVotes: 0,
      passVotes: 0,
      criticalFailureVotes: 0,
      pass: false,
      criticalDisagreement: false,
    };
    return {
      votes: [],
      consensus,
      panelDigest: stableDigest({ votes: [], consensus }),
    };
  }
  const votes: JudgeVote[] = [];
  for (const model of config.models) {
    const prompt = JSON.stringify({
      atomId: input.atomId,
      instruction: input.prompt,
    });
    const promptDigest = stableDigest({ model, prompt });
    if (stopped(transport)) {
      votes.push(stoppedVote(model, promptDigest, 0, transport));
      continue;
    }
    let finalVote: JudgeVote | undefined;
    for (
      let attempt = 1;
      attempt <= config.malformedRetries + 1;
      attempt += 1
    ) {
      let response;
      try {
        response = await transport.request({
          model,
          prompt,
          responseFormat: config.responseFormat,
          maxOutputTokens: 0,
        });
      } catch {
        finalVote = {
          state: "provider_error",
          requestedModel: model,
          promptDigest,
          attemptCount: attempt,
        };
        break;
      }
      if (response.state === "provider_error") {
        finalVote = {
          state: "provider_error",
          requestedModel: model,
          promptDigest,
          attemptCount: attempt,
        };
        break;
      }
      if (response.state === "budget_stopped") {
        finalVote = stoppedVote(model, promptDigest, attempt, transport);
        break;
      }
      const parsed = parseJudgeDimensions(response.body);
      const digest = canonicalResponseDigest(response.body, parsed);
      if (response.resolvedModel !== model) {
        finalVote = {
          state: "model_drift",
          requestedModel: model,
          resolvedModel: response.resolvedModel,
          promptDigest,
          responseDigest: digest,
          attemptCount: attempt,
        };
        break;
      }
      if (parsed) {
        const pass = dimensionsPass(parsed);
        finalVote = {
          state: "valid",
          requestedModel: model,
          resolvedModel: response.resolvedModel,
          promptDigest,
          responseDigest: digest,
          attemptCount: attempt,
          pass,
          criticalFailure: parsed.criticalFailure,
          dimensions: parsed,
        };
        break;
      }
      if (attempt === config.malformedRetries + 1) {
        finalVote = {
          state: "malformed",
          requestedModel: model,
          resolvedModel: response.resolvedModel,
          promptDigest,
          responseDigest: digest,
          attemptCount: attempt,
        };
      }
      if (stopped(transport)) break;
    }
    votes.push(
      finalVote ?? {
        state: "unavailable",
        requestedModel: model,
        promptDigest,
        attemptCount: 0,
      },
    );
  }
  const consensus = aggregateJudgeVotes(votes, config.models);
  return { votes, consensus, panelDigest: stableDigest({ votes, consensus }) };
}

export interface PublicJudgeVoteContext {
  trialId: string;
  evidenceRefs: readonly string[];
}

export function toPublicJudgeVotes(
  panel: JudgePanelResult,
  context: PublicJudgeVoteContext,
): PublicJudgeVote[] {
  return panel.votes.map((vote): PublicJudgeVote => {
    const base = {
      release: RELEASE_ID,
      trialId: context.trialId,
      judgeId: `openai:${vote.requestedModel}`,
      requestedModelId: vote.requestedModel,
      evidenceRefs: [...context.evidenceRefs],
    } as const;
    if (vote.state === "valid") {
      return {
        ...base,
        resolvedModelId: vote.resolvedModel,
        promptDigest: vote.promptDigest as `sha256:${string}`,
        responseDigest: vote.responseDigest as `sha256:${string}`,
        state: "measured",
        dimensions: vote.dimensions,
      };
    }
    return {
      ...base,
      state: "judge_unavailable",
      reason: vote.state,
    };
  });
}

export function judgeOutcomeState(
  panel: JudgePanelResult,
): Extract<
  ResultState,
  "measured" | "judge_disagreement" | "judge_unavailable"
> | null {
  switch (panel.consensus.state) {
    case "pass":
    case "fail":
    case "critical_failure":
      return "measured";
    case "tie":
      return "judge_disagreement";
    case "insufficient_votes":
      return "judge_unavailable";
    case "deterministic_failure":
      return null;
  }
}

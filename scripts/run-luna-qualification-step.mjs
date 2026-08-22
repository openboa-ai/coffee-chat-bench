#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  evaluatePointwise,
  getBenchmarkInput,
} from "../src/benchmark-contracts.ts";
import { validateBank } from "../src/bank.ts";
import { stableDigest } from "../src/contracts.ts";
import { validateQualificationCorpus } from "../src/qualification.ts";
import { buildQualificationReadiness } from "./qualification-readiness.mjs";
import { evaluateAbsoluteGate } from "./qualification-gates.mjs";
import { computeQualificationMetrics } from "./qualification-metrics.mjs";
import { writeQualificationPlots } from "./qualification-plots.mjs";
import {
  campaignIsCompatible,
  metricsBelongToCampaign,
} from "./qualification-campaign-integrity.mjs";
import {
  allowlistedCompletionEvidence,
  allowlistedEvaluationResult,
  allowlistedTransportAttempts,
  summarizeTransportMetrics,
} from "./qualification-transport-evidence.mjs";
import {
  JUDGE_PROMPT_DIMENSIONS,
  normalizeJudgePromptDocument,
} from "./judge-prompt-bundle.mjs";
import {
  assertFullIterationAvailable,
  assertMiniBatchAvailable,
  budgetUsed,
  latestFullStepId,
  miniBatchesSinceFull,
} from "./hill-climbing-policy.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const MODEL = "gpt-5.6-luna";
const MAX_CONCURRENCY = 4;
const DEFAULT_MAX_OUTPUT_TOKENS = 2_048;

function usage() {
  throw new TypeError(
    "usage: run-luna-qualification-step.mjs --transport <module> [--kind full|mini] [--mini-plan <json>] [--step-id <id>] [--prompt <json>] [--prompt-bundle <json>] [--changed-dimension <dimension>] [--hypothesis <text>] [--root <path>]",
  );
}

function parseArgs(args) {
  const parsed = {
    transport: null,
    kind: "full",
    miniPlanPath: null,
    stepId: null,
    promptPath: null,
    promptBundlePath: null,
    changedDimensions: [],
    hypothesis: "baseline prompt; no prior hill-climbing hypothesis",
    root: ROOT,
    reasoningEffort: "low",
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === "--transport" && value) parsed.transport = resolve(value);
    else if (flag === "--kind" && value) parsed.kind = value;
    else if (flag === "--mini-plan" && value)
      parsed.miniPlanPath = resolve(value);
    else if (flag === "--step-id" && value) parsed.stepId = value;
    else if (flag === "--prompt" && value) parsed.promptPath = resolve(value);
    else if (flag === "--prompt-bundle" && value)
      parsed.promptBundlePath = resolve(value);
    else if (flag === "--changed-dimension" && value)
      parsed.changedDimensions.push(value);
    else if (flag === "--hypothesis" && value) parsed.hypothesis = value;
    else if (flag === "--root" && value) parsed.root = resolve(value);
    else if (flag === "--reasoning-effort" && value)
      parsed.reasoningEffort = value;
    else if (flag === "--max-output-tokens" && value)
      parsed.maxOutputTokens = Number(value);
    else usage();
    index += 1;
  }
  if (!parsed.transport) usage();
  if (!new Set(["full", "mini"]).has(parsed.kind))
    throw new TypeError("--kind must be full or mini");
  if (parsed.kind === "mini" && !parsed.miniPlanPath)
    throw new TypeError("--mini-plan is required for --kind mini");
  if (parsed.kind === "full" && parsed.miniPlanPath)
    throw new TypeError("--mini-plan is only valid for --kind mini");
  if (parsed.promptPath && parsed.promptBundlePath)
    throw new TypeError("use either --prompt or --prompt-bundle, not both");
  for (const dimension of parsed.changedDimensions)
    if (!JUDGE_PROMPT_DIMENSIONS.includes(dimension))
      throw new TypeError(
        `--changed-dimension must be one of ${JUDGE_PROMPT_DIMENSIONS.join(", ")}`,
      );
  parsed.changedDimensions = [...new Set(parsed.changedDimensions)];
  if (
    !Number.isInteger(parsed.maxOutputTokens) ||
    parsed.maxOutputTokens < 1 ||
    parsed.maxOutputTokens > DEFAULT_MAX_OUTPUT_TOKENS
  )
    throw new TypeError(
      `--max-output-tokens must be between 1 and ${DEFAULT_MAX_OUTPUT_TOKENS}`,
    );
  return parsed;
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function jsonLines(path) {
  return (await readFile(path, "utf8"))
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new TypeError(`invalid JSONL at ${path}:${index + 1}`, {
          cause: error,
        });
      }
    });
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replaceAll(/[-:.]/gu, "").replace("000Z", "Z");
}

function stepId(provided) {
  return provided ?? `0000-${compactTimestamp()}-${randomUUID().slice(0, 8)}`;
}

function mapLimit(items, limit, worker) {
  const results = Array(items.length);
  let next = 0;
  async function consume() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  return Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, consume),
  ).then(() => results);
}

function loadChildTransport(modulePath) {
  const child = spawn(process.execPath, [modulePath], {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "inherit"],
    env: process.env,
  });
  child.stdout.setEncoding("utf8");
  let buffer = "";
  let sequence = 0;
  const pending = new Map();
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim() === "") continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        for (const entry of pending.values())
          entry.reject(
            new Error("transport emitted invalid JSON", { cause: error }),
          );
        pending.clear();
        continue;
      }
      const entry = pending.get(message.id);
      if (!entry) continue;
      pending.delete(message.id);
      if (message.error) {
        const error = new Error(message.error);
        error.attempts = message.attempts ?? [];
        entry.reject(error);
      } else
        entry.resolve({
          completion: message.result,
          attempts: message.attempts ?? [],
        });
    }
  });
  const fail = (error) => {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };
  child.on("error", fail);
  child.on("exit", (code, signal) => {
    if (code !== 0 || signal)
      fail(new Error(`transport exited (${code ?? signal})`));
  });
  return {
    async complete(request) {
      const id = `request-${sequence++}`;
      return new Promise((resolvePromise, reject) => {
        pending.set(id, { resolve: resolvePromise, reject });
        child.stdin.write(`${JSON.stringify({ id, request })}\n`);
      });
    },
    close() {
      child.stdin.end();
    },
  };
}

function requestKey(request) {
  return stableDigest(request);
}

function renderedPromptDigest(request) {
  return stableDigest({
    kind: request.kind,
    dimension: request.dimension,
    prompt: request.prompt,
  });
}

function recordingTransport(source) {
  const calls = new Map();
  return {
    calls,
    transport: {
      async complete(request) {
        const call = { request, attempts: [], completion: null };
        calls.set(requestKey(request), call);
        try {
          const response = await source.complete(request);
          call.attempts = allowlistedTransportAttempts(response.attempts);
          call.completion = allowlistedCompletionEvidence(response.completion);
          return response.completion;
        } catch (error) {
          call.attempts = allowlistedTransportAttempts(error?.attempts ?? []);
          throw error;
        }
      },
    },
  };
}

function labelForDimension(label, dimension) {
  if (dimension === "judgment_alignment") return label.judgmentAlignment;
  if (dimension === "stated_rationale_alignment")
    return label.statedRationaleAlignment;
  if (dimension === "task_performance") return label.taskPerformance;
  if (dimension === "evidence_grounding") return label.evidenceGrounding;
  return label.hardConstraintViolation;
}

function referenceValue(label, dimension) {
  const value = labelForDimension(label, dimension);
  if (dimension === "hard_constraint_violation") return value.detected;
  return value;
}

function metricTiming(call, started) {
  return summarizeTransportMetrics(call, {
    wallClockLatencyMs: Date.now() - started,
  });
}

async function updateIndex(path, entry) {
  const index = existsSync(path)
    ? await json(path)
    : {
        artifact_type: "qualification_step_index",
        campaignId: "luna_provisional_judge",
        steps: [],
      };
  if (index.steps.some((candidate) => candidate.stepId === entry.stepId))
    throw new TypeError(`refusing to overwrite step ${entry.stepId}`);
  index.steps.push(entry);
  await writeFile(path, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return index;
}

function routeKey(entry) {
  return `${entry.exampleId}\u0000${entry.dimension}`;
}

async function loadMiniPlan(path, fullPlan, corpus, labelManifest) {
  const plan = await json(path);
  if (plan.artifact_type !== "qualification_mini_measurement_plan")
    throw new TypeError("mini plan has an invalid artifact_type");
  if (plan.sourcePlanDigest !== fullPlan.planDigest)
    throw new TypeError("mini plan sourcePlanDigest does not match full plan");
  if (plan.corpusDigest !== corpus.manifest.corpusDigest)
    throw new TypeError("mini plan corpus digest does not match corpus");
  if (plan.labelDigest !== labelManifest.referenceLabelsDigest)
    throw new TypeError("mini plan label digest does not match labels");
  const { planDigest, ...miniPlanSemantic } = plan;
  if (planDigest !== stableDigest(miniPlanSemantic))
    throw new TypeError("mini plan digest does not match its content");
  if (!Array.isArray(plan.entries) || plan.entries.length === 0)
    throw new TypeError("mini plan must contain at least one entry");
  const fullEntries = new Map(
    fullPlan.entries.map((entry) => [routeKey(entry), entry]),
  );
  const seen = new Set();
  for (const entry of plan.entries) {
    const key = routeKey(entry);
    if (seen.has(key)) throw new TypeError(`mini plan repeats ${key}`);
    seen.add(key);
    const fullEntry = fullEntries.get(key);
    if (!fullEntry)
      throw new TypeError(`mini plan contains an unknown route ${key}`);
    if (entry.condition !== fullEntry.condition)
      throw new TypeError(`mini plan condition mismatch for ${key}`);
  }
  if (plan.entries.length >= fullPlan.entries.length)
    throw new TypeError(
      "mini plan must be smaller than the full measurement plan",
    );
  return plan;
}

async function historyWithMetrics(campaignRoot, steps, expectedEvidence) {
  const history = [];
  for (const entry of steps) {
    const metricsPath = join(campaignRoot, entry.metricsPath);
    if (!existsSync(metricsPath)) continue;
    const metrics = await json(metricsPath);
    if (!metricsBelongToCampaign(metrics, expectedEvidence)) continue;
    history.push({
      stepId: entry.stepId,
      fullIterationNumber:
        entry.fullIterationNumber ??
        (entry.gateDecision === "baseline" ? 0 : null),
      metrics,
    });
  }
  return history;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const qualificationRoot = join(options.root, "qualification");
  const corpusRoot = join(qualificationRoot, "corpus");
  const campaignRoot = join(qualificationRoot, "hill-climbing");
  const stepsRoot = join(campaignRoot, "steps");
  const miniRoot = join(campaignRoot, "mini");
  const currentStepId = stepId(options.stepId);
  const stepRoot = join(
    options.kind === "mini" ? miniRoot : stepsRoot,
    currentStepId,
  );
  if (
    existsSync(stepRoot) ||
    existsSync(join(stepsRoot, currentStepId)) ||
    existsSync(join(miniRoot, currentStepId))
  )
    throw new TypeError(`refusing to overwrite existing step ${currentStepId}`);
  await mkdir(campaignRoot, { recursive: true });
  const indexPath = join(campaignRoot, "index.json");
  const miniIndexPath = join(campaignRoot, "mini-index.json");
  const existingIndex = existsSync(indexPath) ? await json(indexPath) : null;
  const existingMiniIndex = existsSync(miniIndexPath)
    ? await json(miniIndexPath)
    : { artifact_type: "qualification_mini_step_index", steps: [] };
  const existingCampaign = existsSync(join(campaignRoot, "campaign.json"))
    ? await json(join(campaignRoot, "campaign.json"))
    : null;
  const campaignPolicy = await json(join(campaignRoot, "campaign-policy.json"));
  if (
    campaignPolicy.model !== MODEL ||
    campaignPolicy.fullMeasurementCalls !== 624 ||
    campaignPolicy.fullIterationBudget !== 100 ||
    campaignPolicy.miniBatchLimitBetweenFull !== 4
  )
    throw new TypeError(
      "campaign policy does not match the fixed Luna campaign",
    );

  const fullSteps = existingIndex?.steps ?? [];
  const miniSteps = existingMiniIndex.steps ?? [];
  const latestFull = latestFullStepId(fullSteps);
  let fullIterationNumber = null;
  let miniBatchNumber = null;
  let parentStepId = latestFull;
  if (options.kind === "full") {
    const allowance = assertFullIterationAvailable(fullSteps, campaignPolicy);
    fullIterationNumber = allowance.used + 1;
  } else {
    if (!latestFull)
      throw new TypeError(
        "a completed full step is required before a mini batch",
      );
    const allowance = assertMiniBatchAvailable(
      miniSteps,
      latestFull,
      campaignPolicy,
    );
    miniBatchNumber = allowance.used + 1;
  }

  const promptSourcePath =
    options.promptBundlePath ??
    options.promptPath ??
    join(qualificationRoot, "baseline-prompt.json");
  const promptDocument = await json(promptSourcePath);
  const promptBundle = normalizeJudgePromptDocument(promptDocument);
  if (
    options.changedDimensions.length > 0 &&
    promptBundle.mode !== "independent_lanes"
  )
    throw new TypeError(
      "--changed-dimension requires an independent_lanes prompt bundle",
    );
  const protocolsByDimension = promptBundle.protocolsByDimension;
  const gatePolicy = await json(join(qualificationRoot, "gate-policy.json"));
  const gatePolicyDigest = stableDigest(gatePolicy);
  const readiness = await buildQualificationReadiness(options.root);
  if (readiness.status !== "ready_for_new_baseline")
    throw new TypeError(
      `qualification readiness is ${readiness.status}; run was not started`,
    );
  const bank = await validateBank(join(options.root, "bank"));
  const corpus = await validateQualificationCorpus(
    corpusRoot,
    join(options.root, "bank"),
  );
  const labels = new Map(
    (await jsonLines(join(corpusRoot, "reference-labels.jsonl"))).map(
      (label) => [label.exampleId, label],
    ),
  );
  if (labels.size !== corpus.submissions.length)
    throw new TypeError("reference label and submission census differ");
  const labelManifest = await json(
    join(corpusRoot, "reference-labels-manifest.json"),
  );
  const measurementPlan = await json(
    join(qualificationRoot, "measurement-plan.json"),
  );
  if (measurementPlan.corpusDigest !== corpus.manifest.corpusDigest)
    throw new TypeError("measurement plan corpus digest does not match corpus");
  const submissionById = new Map(
    corpus.submissions.map((submission) => [submission.exampleId, submission]),
  );
  if (measurementPlan.labelDigest !== labelManifest.referenceLabelsDigest)
    throw new TypeError(
      "measurement plan label digest does not match manifest",
    );
  const miniPlan =
    options.kind === "mini"
      ? await loadMiniPlan(
          options.miniPlanPath,
          measurementPlan,
          corpus,
          labelManifest,
        )
      : null;
  const routingPlan = miniPlan ?? measurementPlan;
  const routingPlanDigest = miniPlan
    ? miniPlan.planDigest
    : measurementPlan.planDigest;
  const casesById = new Map(
    bank.cases.map((entry) => [entry.entry.caseId, entry]),
  );
  const routed = routingPlan.entries.map((entry) => {
    const submission = submissionById.get(entry.exampleId);
    const label = labels.get(entry.exampleId);
    if (!submission || !label)
      throw new TypeError(
        `measurement plan has an unknown example ${entry.exampleId}`,
      );
    if (submission.condition !== entry.condition)
      throw new TypeError(
        `measurement plan condition mismatch for ${entry.exampleId}`,
      );
    return {
      submission,
      dimension: entry.dimension,
      label,
    };
  });
  if (options.kind === "full" && routed.length !== 624)
    throw new TypeError("measurement plan must route exactly 624 calls");
  if (options.kind === "mini" && routed.length >= 624)
    throw new TypeError("mini plan must route fewer than 624 calls");
  const previousFullMatrixHistory = await historyWithMetrics(
    campaignRoot,
    fullSteps,
    {
      measurementPlanDigest: measurementPlan.planDigest,
      gatePolicyId: gatePolicy.policyId,
      gatePolicyDigest,
    },
  );
  const isFirstFullMatrixRun = previousFullMatrixHistory.length === 0;
  const compatibleCampaign = campaignIsCompatible(existingCampaign, {
    measurementPlanDigest: measurementPlan.planDigest,
    gatePolicyId: gatePolicy.policyId,
    gatePolicyDigest,
  });
  const acceptedStepIdBefore = compatibleCampaign
    ? (existingCampaign?.acceptedStepId ?? null)
    : null;
  const promptBundleDigest = promptBundle.bundleDigest;
  const judgeConfiguration = {
    model: MODEL,
    tools: [],
    store: false,
    reasoningEffort: options.reasoningEffort,
    maxOutputTokens: options.maxOutputTokens,
    maxConcurrency: MAX_CONCURRENCY,
    maxRetries: 1,
    transport: "injected",
  };
  const judgeConfigurationDigest = stableDigest(judgeConfiguration);
  await mkdir(stepRoot, { recursive: true });
  await writeFile(
    join(stepRoot, "manifest.json"),
    `${JSON.stringify(
      {
        artifact_type: "provisional_judge_step",
        stepId: currentStepId,
        parentStepId,
        hypothesis: options.hypothesis,
        completionState: "running",
        runKind: options.kind,
        evidenceState: "provisional",
        model: MODEL,
        corpusDigest: corpus.manifest.corpusDigest,
        labelDigest: labelManifest.referenceLabelsDigest,
        measurementPlanDigest: measurementPlan.planDigest,
        routingPlanDigest,
        routingPlanPath: miniPlan ? "routing-plan.json" : null,
        gatePolicyId: gatePolicy.policyId,
        gatePolicyDigest,
        campaignPolicyId: campaignPolicy.policyId,
        campaignPolicyDigest: stableDigest(campaignPolicy),
        fullIterationBudget: campaignPolicy.fullIterationBudget,
        baselineCountsAgainstBudget: campaignPolicy.baselineCountsAgainstBudget,
        miniBatchLimitBetweenFull: campaignPolicy.miniBatchLimitBetweenFull,
        fullIterationNumber,
        miniBatchNumber,
        parentFullStepId: latestFull,
        readinessDigest: readiness.readinessDigest,
        promptMode: promptBundle.mode,
        promptBundleId: promptBundle.bundleId,
        promptBundleDigest,
        promptDigests: promptBundle.promptDigests,
        changedDimensions: options.changedDimensions,
        promptSourcePath,
        promptDigest: promptBundleDigest,
        judgeConfiguration,
        judgeConfigurationDigest,
        submissionCensus: corpus.submissions.length,
        plannedCalls: routed.length,
        routing: Object.fromEntries(
          Object.entries(Object.groupBy(routed, (row) => row.dimension)).map(
            ([key, rows]) => [key, rows.length],
          ),
        ),
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    join(stepRoot, "prompt.json"),
    `${JSON.stringify(promptBundle.document, null, 2)}\n`,
    "utf8",
  );
  if (miniPlan)
    await writeFile(
      join(stepRoot, "routing-plan.json"),
      `${JSON.stringify(miniPlan, null, 2)}\n`,
      "utf8",
    );
  const labelsForStep = miniPlan
    ? [
        ...new Map(
          routed.map((row) => [row.submission.exampleId, row.label]),
        ).values(),
      ]
    : [...labels.values()];
  await writeFile(
    join(stepRoot, "reference-labels.json"),
    `${JSON.stringify(labelsForStep, null, 2)}\n`,
    "utf8",
  );
  const evaluationsPath = join(stepRoot, "evaluations.jsonl");
  await writeFile(evaluationsPath, "", "utf8");

  const child = loadChildTransport(options.transport);
  const recording = recordingTransport(child);
  const observations = [];
  const rows = await mapLimit(
    routed,
    MAX_CONCURRENCY,
    async ({ submission, dimension, label }) => {
      const started = Date.now();
      const protocol = protocolsByDimension[dimension];
      const promptDigest = promptBundle.promptDigests[dimension];
      const source = casesById.get(submission.sourceCaseId);
      if (!source)
        throw new TypeError(`missing source case ${submission.sourceCaseId}`);
      const benchmarkInput = getBenchmarkInput(
        source.manifest,
        submission.condition,
      );
      let evaluation;
      try {
        evaluation = await evaluatePointwise({
          benchmarkInput,
          submission: submission.candidateSubmission,
          dimension,
          transport: recording.transport,
          protocol,
        });
      } catch (error) {
        evaluation = {
          input: benchmarkInput,
          submission: submission.candidateSubmission,
          objective: {
            state: "invalid",
            cause: error instanceof Error ? error.message : String(error),
          },
          dimension,
          request: null,
          result: {
            state: "unavailable",
            cause: error instanceof Error ? error.message : String(error),
            provenance: { protocolDigest: promptDigest },
          },
        };
      }
      const request = evaluation.request;
      const call = request ? recording.calls.get(requestKey(request)) : null;
      const timing = metricTiming(call, started);
      const reference = referenceValue(label, dimension);
      const persistedResult = allowlistedEvaluationResult(evaluation.result);
      const row = {
        exampleId: submission.exampleId,
        familyVariantId: submission.familyVariantId,
        sourceCaseId: submission.sourceCaseId,
        condition: submission.condition,
        dimension,
        promptLane: dimension,
        promptBundleDigest,
        protocolId: protocol.protocolId,
        protocolDigest: promptDigest,
        artifact: submission.candidateSubmission.artifact,
        decisionRecord: submission.candidateSubmission.decisionRecord,
        artifactDigest:
          evaluation.objective.state === "valid"
            ? evaluation.objective.artifact.digest
            : null,
        renderedPrompt: request?.prompt ?? null,
        promptDigest: request ? renderedPromptDigest(request) : null,
        callIssued: Boolean(request),
        rawResponse: call?.completion ?? null,
        rawResponseDigest: call?.completion
          ? stableDigest(call.completion)
          : null,
        attempts: call?.attempts ?? [],
        result: persistedResult,
        referenceLabel: reference,
        labelAuthority: label.authority,
        labelReviewState: label.reviewState,
        latencyMs: timing.latencyMs,
        outputTokens: timing.outputTokens,
        evidenceState: "provisional",
        provenance: persistedResult.provenance ?? null,
        measuredAt: new Date().toISOString(),
      };
      observations.push({
        exampleId: submission.exampleId,
        dimension,
        reference,
        result: evaluation.result,
        latencyMs: timing.latencyMs,
        outputTokens: timing.outputTokens,
      });
      await appendFile(evaluationsPath, `${JSON.stringify(row)}\n`, "utf8");
      return row;
    },
  );
  child.close();
  const metrics = computeQualificationMetrics(observations);
  const actualCalls = rows.filter((row) => row.callIssued === true).length;
  const completionState =
    actualCalls === routed.length ? "complete" : "incomplete";
  const gate = evaluateAbsoluteGate({ metrics, readiness, policy: gatePolicy });
  const decision =
    completionState === "incomplete"
      ? "incomplete"
      : options.kind === "mini"
        ? "mini"
        : isFirstFullMatrixRun
          ? "baseline"
          : gate.status === "passed"
            ? "accepted"
            : gate.status === "not_ready"
              ? "not_ready"
              : "rejected";
  const acceptedStepIdAfter =
    options.kind === "full" &&
    completionState === "complete" &&
    gate.status === "passed"
      ? currentStepId
      : acceptedStepIdBefore;
  await writeFile(
    join(stepRoot, "metrics.json"),
    `${JSON.stringify({ artifact_type: "qualification_metrics", evidenceState: "provisional", stepId: currentStepId, runKind: options.kind, model: MODEL, corpusDigest: corpus.manifest.corpusDigest, labelDigest: labelManifest.referenceLabelsDigest, measurementPlanDigest: measurementPlan.planDigest, routingPlanDigest, gatePolicyId: gatePolicy.policyId, gatePolicyDigest, campaignPolicyId: campaignPolicy.policyId, promptMode: promptBundle.mode, promptBundleId: promptBundle.bundleId, promptBundleDigest, promptDigests: promptBundle.promptDigests, changedDimensions: options.changedDimensions, promptDigest: promptBundleDigest, metrics }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(stepRoot, "gate.json"),
    `${JSON.stringify({ artifact_type: "hill_climbing_gate", evidenceState: "provisional", decision, scope: options.kind === "mini" ? "diagnostic_only" : "full_iteration", gate, candidateStepId: currentStepId, acceptedStepIdBefore, acceptedStepIdAfter, expectedCalls: routed.length, actualCalls, measurementPlanDigest: measurementPlan.planDigest, routingPlanDigest, gatePolicyId: gatePolicy.policyId, gatePolicyDigest, campaignPolicyId: campaignPolicy.policyId, fullIterationNumber, miniBatchNumber, parentFullStepId: latestFull, promptMode: promptBundle.mode, promptBundleId: promptBundle.bundleId, promptBundleDigest, promptDigests: promptBundle.promptDigests, changedDimensions: options.changedDimensions, routing: Object.fromEntries(Object.entries(Object.groupBy(routed, (row) => row.dimension)).map(([key, rows]) => [key, rows.length])), summary: { coverage: metrics.coverage, invalidRate: metrics.invalidRate } }, null, 2)}\n`,
    "utf8",
  );
  const index = await updateIndex(
    options.kind === "mini" ? miniIndexPath : indexPath,
    {
      runKind: options.kind,
      stepId: currentStepId,
      parentStepId,
      parentFullStepId: latestFull,
      fullIterationNumber,
      miniBatchNumber,
      hypothesis: options.hypothesis,
      promptMode: promptBundle.mode,
      promptBundleId: promptBundle.bundleId,
      promptBundleDigest,
      promptDigests: promptBundle.promptDigests,
      changedDimensions: options.changedDimensions,
      promptDigest: promptBundleDigest,
      measurementPlanDigest: measurementPlan.planDigest,
      routingPlanDigest,
      gatePolicyId: gatePolicy.policyId,
      gatePolicyDigest,
      campaignPolicyId: campaignPolicy.policyId,
      metricsPath: `${options.kind === "mini" ? "mini" : "steps"}/${currentStepId}/metrics.json`,
      manifestPath: `${options.kind === "mini" ? "mini" : "steps"}/${currentStepId}/manifest.json`,
      gatePath: `${options.kind === "mini" ? "mini" : "steps"}/${currentStepId}/gate.json`,
      gateDecision: decision,
      completionState,
    },
  );
  const history = await historyWithMetrics(
    campaignRoot,
    fullSteps.concat(options.kind === "full" ? [index.steps.at(-1)] : []),
    {
      measurementPlanDigest: measurementPlan.planDigest,
      gatePolicyId: gatePolicy.policyId,
      gatePolicyDigest,
    },
  );
  await writeQualificationPlots({
    stepDirectory: stepRoot,
    campaignDirectory: campaignRoot,
    stepId: currentStepId,
    history,
    metrics,
    writeProgress: options.kind === "full",
  });
  if (
    options.kind === "full" &&
    completionState === "complete" &&
    gate.status === "passed"
  )
    await writeFile(
      join(campaignRoot, "accepted-prompt.json"),
      `${JSON.stringify({ acceptedStepId: currentStepId, prompt: promptBundle.document, promptMode: promptBundle.mode, promptBundleId: promptBundle.bundleId, promptBundleDigest, promptDigests: promptBundle.promptDigests, gatePolicyId: gatePolicy.policyId, gatePolicyDigest, status: decision }, null, 2)}\n`,
      "utf8",
    );
  const miniIndexAfter = options.kind === "mini" ? index : existingMiniIndex;
  const latestFullAfter = options.kind === "full" ? currentStepId : latestFull;
  await writeFile(
    join(campaignRoot, "campaign.json"),
    `${JSON.stringify({ artifact_type: "qualification_campaign", campaignId: "luna_provisional_judge", status: "provisional", model: MODEL, corpusDigest: corpus.manifest.corpusDigest, labelDigest: labelManifest.referenceLabelsDigest, measurementPlanDigest: measurementPlan.planDigest, gatePolicyId: gatePolicy.policyId, gatePolicyDigest, campaignPolicyId: campaignPolicy.policyId, campaignPolicyDigest: stableDigest(campaignPolicy), fullIterationBudget: campaignPolicy.fullIterationBudget, baselineCountsAgainstBudget: campaignPolicy.baselineCountsAgainstBudget, fullIterationsUsed: budgetUsed(options.kind === "full" ? index.steps : fullSteps), miniBatchLimitBetweenFull: campaignPolicy.miniBatchLimitBetweenFull, miniBatchesSinceLatestFull: miniBatchesSinceFull(miniIndexAfter.steps ?? [], latestFullAfter), acceptedStepId: acceptedStepIdAfter, fullStepCount: history.length, miniStepCount: miniIndexAfter.steps?.length ?? 0, latestFullStepId: latestFullAfter, latestStepId: currentStepId, latestRunKind: options.kind, latestDecision: decision, latestPromptMode: promptBundle.mode, latestPromptBundleId: promptBundle.bundleId, latestPromptBundleDigest: promptBundleDigest, latestPromptDigests: promptBundle.promptDigests, progressSeries: campaignPolicy.progressSeries, publicBenchmarkStatus: "not_active", publicBenchmarkUnchanged: true }, null, 2)}\n`,
    "utf8",
  );
  const finalManifest = await json(join(stepRoot, "manifest.json"));
  await writeFile(
    join(stepRoot, "manifest.json"),
    `${JSON.stringify({ ...finalManifest, completionState, completedAt: new Date().toISOString(), actualCalls, apiAttempts: rows.reduce((sum, row) => sum + row.attempts.length, 0), gateDecision: decision, metricsPath: `${options.kind === "mini" ? "mini" : "steps"}/${currentStepId}/metrics.json`, evaluationsPath: `${options.kind === "mini" ? "mini" : "steps"}/${currentStepId}/evaluations.jsonl`, gatePath: `${options.kind === "mini" ? "mini" : "steps"}/${currentStepId}/gate.json` }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `${JSON.stringify({ stepId: currentStepId, runKind: options.kind, fullIterationNumber, miniBatchNumber, decision, actualCalls, plannedCalls: routed.length, statusCounts: metrics.statusCounts, macro: metrics.macro, progressPath: join(campaignRoot, "progress.png"), stepDirectory: stepRoot })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});

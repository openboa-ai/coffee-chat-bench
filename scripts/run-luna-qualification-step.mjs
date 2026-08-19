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
import { computeQualificationMetrics } from "./qualification-metrics.mjs";
import { writeQualificationPlots } from "./qualification-plots.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const MODEL = "gpt-5.6-luna";
const MAX_CONCURRENCY = 4;
const DEFAULT_MAX_OUTPUT_TOKENS = 256;

function usage() {
  throw new TypeError(
    "usage: run-luna-qualification-step.mjs --transport <module> [--step-id <id>] [--prompt <json>] [--hypothesis <text>] [--root <path>]",
  );
}

function parseArgs(args) {
  const parsed = {
    transport: null,
    stepId: null,
    promptPath: null,
    hypothesis: "baseline prompt; no prior hill-climbing hypothesis",
    root: ROOT,
    reasoningEffort: "low",
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === "--transport" && value) parsed.transport = resolve(value);
    else if (flag === "--step-id" && value) parsed.stepId = value;
    else if (flag === "--prompt" && value) parsed.promptPath = resolve(value);
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
  if (!Number.isInteger(parsed.maxOutputTokens) || parsed.maxOutputTokens < 1)
    throw new TypeError("--max-output-tokens must be a positive integer");
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

function safe(value, key = "") {
  if (/(?:authorization|api[_-]?key|secret|password|cookie)/iu.test(key))
    return "[REDACTED]";
  if (typeof value === "string")
    return value.replaceAll(
      /(?:sk|sess|rk)-[A-Za-z0-9_-]{12,}/gu,
      "[REDACTED]",
    );
  if (Array.isArray(value)) return value.map((entry) => safe(entry));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        safe(entryValue, entryKey),
      ]),
    );
  return value;
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
      results[index] = await worker(items[index], index);
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
      if (message.error) entry.reject(new Error(message.error));
      else
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

function recordingTransport(source) {
  const calls = new Map();
  return {
    calls,
    transport: {
      async complete(request) {
        const call = { request, attempts: [], completion: null };
        calls.set(request.promptDigest, call);
        const response = await source.complete(request);
        call.attempts = safe(response.attempts);
        call.completion = safe(response.completion);
        return response.completion;
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

function routeDimension(intent, condition) {
  if (intent === "hard_constraint_breach") return "hard_constraint_violation";
  if (intent === "material_task_omission") return "task_performance";
  if (
    intent === "grounding_weakness" ||
    intent === "unsupported_material_claim"
  )
    return "evidence_grounding";
  if (
    intent === "rationale_action_inconsistency" ||
    intent === "rationale_underspecified"
  )
    return condition === "unconditioned"
      ? "task_performance"
      : "stated_rationale_alignment";
  if (
    intent === "context_insensitive_judgment" ||
    intent === "cue_omission" ||
    intent === "target_insensitive_judgment" ||
    intent === "target_policy_reversal"
  )
    return condition === "unconditioned"
      ? "task_performance"
      : "judgment_alignment";
  return condition === "unconditioned"
    ? "task_performance"
    : "judgment_alignment";
}

function referenceValue(label, dimension) {
  const value = labelForDimension(label, dimension);
  if (dimension === "hard_constraint_violation") return value.detected;
  return value;
}

function metricTiming(call, started) {
  const attempts = call?.attempts ?? [];
  const latency = attempts.reduce(
    (sum, attempt) =>
      sum + (typeof attempt.latencyMs === "number" ? attempt.latencyMs : 0),
    0,
  );
  const usage = attempts.at(-1)?.usage ?? call?.completion?.metadata?.usage;
  return {
    latencyMs: latency || Date.now() - started,
    outputTokens: usage?.output_tokens ?? usage?.outputTokens ?? null,
  };
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

async function historyWithMetrics(campaignRoot, steps) {
  return Promise.all(
    steps.map(async (entry) => {
      const metricsPath = join(campaignRoot, entry.metricsPath);
      return {
        stepId: entry.stepId,
        metrics: existsSync(metricsPath) ? await json(metricsPath) : null,
      };
    }),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const qualificationRoot = join(options.root, "qualification");
  const corpusRoot = join(qualificationRoot, "corpus");
  const campaignRoot = join(qualificationRoot, "hill-climbing");
  const stepsRoot = join(campaignRoot, "steps");
  const currentStepId = stepId(options.stepId);
  const stepRoot = join(stepsRoot, currentStepId);
  if (existsSync(stepRoot))
    throw new TypeError(`refusing to overwrite existing step ${currentStepId}`);
  await mkdir(stepRoot, { recursive: true });
  await mkdir(campaignRoot, { recursive: true });
  const indexPath = join(campaignRoot, "index.json");
  const existingIndex = existsSync(indexPath) ? await json(indexPath) : null;
  const parentStepId = existingIndex?.steps.at(-1)?.stepId ?? null;

  const promptDocument = options.promptPath
    ? await json(options.promptPath)
    : await json(join(qualificationRoot, "baseline-prompt.json"));
  const protocol = promptDocument.protocol ?? promptDocument;
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
  const construction = await json(join(corpusRoot, "construction-plan.json"));
  const familyById = new Map(
    construction.familyVariants.map((family) => [
      family.familyVariantId,
      family,
    ]),
  );
  const casesById = new Map(
    bank.cases.map((entry) => [entry.entry.caseId, entry]),
  );
  const routed = corpus.submissions.map((submission) => {
    const family = familyById.get(submission.familyVariantId);
    if (!family)
      throw new TypeError(
        `missing construction family ${submission.familyVariantId}`,
      );
    const dimension = routeDimension(
      family.constructionIntent[submission.condition],
      submission.condition,
    );
    return {
      submission,
      family,
      dimension,
      label: labels.get(submission.exampleId),
    };
  });
  const promptDigest = stableDigest(protocol);
  const labelManifest = await json(
    join(corpusRoot, "reference-labels-manifest.json"),
  );
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
  await writeFile(
    join(stepRoot, "manifest.json"),
    `${JSON.stringify(
      {
        artifact_type: "provisional_judge_step",
        stepId: currentStepId,
        parentStepId,
        hypothesis: options.hypothesis,
        completionState: "running",
        evidenceState: "provisional",
        model: MODEL,
        corpusDigest: corpus.manifest.corpusDigest,
        labelDigest: labelManifest.labelDigest,
        promptDigest,
        judgeConfiguration,
        judgeConfigurationDigest,
        corpusCensus: routed.length,
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
    `${JSON.stringify({ protocol, promptDigest }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(stepRoot, "reference-labels.json"),
    `${JSON.stringify([...labels.values()], null, 2)}\n`,
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
      const call = request ? recording.calls.get(request.promptDigest) : null;
      const timing = metricTiming(call, started);
      const reference = referenceValue(label, dimension);
      const row = safe({
        exampleId: submission.exampleId,
        familyVariantId: submission.familyVariantId,
        sourceCaseId: submission.sourceCaseId,
        condition: submission.condition,
        dimension,
        artifact: submission.candidateSubmission.artifact,
        decisionRecord: submission.candidateSubmission.decisionRecord,
        artifactDigest:
          evaluation.objective.state === "valid"
            ? evaluation.objective.artifact.digest
            : null,
        renderedPrompt: request?.prompt ?? null,
        promptDigest: request?.promptDigest ?? null,
        rawResponse: call?.completion ?? null,
        rawResponseDigest: call?.completion
          ? stableDigest(call.completion)
          : null,
        attempts: call?.attempts ?? [],
        result: evaluation.result,
        referenceLabel: reference,
        labelAuthority: label.authority,
        labelReviewState: label.reviewState,
        latencyMs: timing.latencyMs,
        outputTokens: timing.outputTokens,
        evidenceState: "provisional",
        provenance: evaluation.result.provenance ?? null,
        measuredAt: new Date().toISOString(),
      });
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
  const actualCalls = rows.filter((row) => row.attempts.length > 0).length;
  const completionState =
    actualCalls === routed.length ? "complete" : "incomplete";
  const decision = completionState === "complete" ? "baseline" : "incomplete";
  await writeFile(
    join(stepRoot, "metrics.json"),
    `${JSON.stringify({ artifact_type: "qualification_metrics", evidenceState: "provisional", stepId: currentStepId, model: MODEL, corpusDigest: corpus.manifest.corpusDigest, labelDigest: labelManifest.labelDigest, promptDigest, metrics }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(stepRoot, "gate.json"),
    `${JSON.stringify({ artifact_type: "hill_climbing_gate", evidenceState: "provisional", decision, candidateStepId: currentStepId, expectedCalls: routed.length, actualCalls, routing: Object.fromEntries(Object.entries(Object.groupBy(routed, (row) => row.dimension)).map(([key, rows]) => [key, rows.length])), summary: { coverage: metrics.coverage, invalidRate: metrics.invalidRate } }, null, 2)}\n`,
    "utf8",
  );
  const index = await updateIndex(indexPath, {
    stepId: currentStepId,
    parentStepId,
    hypothesis: options.hypothesis,
    promptDigest,
    metricsPath: `steps/${currentStepId}/metrics.json`,
    manifestPath: `steps/${currentStepId}/manifest.json`,
    gatePath: `steps/${currentStepId}/gate.json`,
    gateDecision: decision,
    completionState,
  });
  const history = await historyWithMetrics(campaignRoot, index.steps);
  await writeQualificationPlots({
    stepDirectory: stepRoot,
    campaignDirectory: campaignRoot,
    stepId: currentStepId,
    history,
    metrics,
  });
  if (decision === "baseline")
    await writeFile(
      join(campaignRoot, "accepted-prompt.json"),
      `${JSON.stringify({ acceptedStepId: currentStepId, prompt: protocol, promptDigest, status: decision }, null, 2)}\n`,
      "utf8",
    );
  await writeFile(
    join(campaignRoot, "campaign.json"),
    `${JSON.stringify({ artifact_type: "qualification_campaign", campaignId: "luna_provisional_judge", status: "provisional", model: MODEL, corpusDigest: corpus.manifest.corpusDigest, labelDigest: labelManifest.labelDigest, acceptedStepId: decision === "baseline" ? currentStepId : null, stepCount: index.steps.length, latestStepId: currentStepId, latestDecision: decision, publicBenchmarkStatus: "not_active", publicBenchmarkUnchanged: true }, null, 2)}\n`,
    "utf8",
  );
  const finalManifest = await json(join(stepRoot, "manifest.json"));
  await writeFile(
    join(stepRoot, "manifest.json"),
    `${JSON.stringify({ ...finalManifest, completionState, completedAt: new Date().toISOString(), actualCalls, apiAttempts: rows.reduce((sum, row) => sum + row.attempts.length, 0), gateDecision: decision, metricsPath: `steps/${currentStepId}/metrics.json`, evaluationsPath: `steps/${currentStepId}/evaluations.jsonl`, gatePath: `steps/${currentStepId}/gate.json` }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `${JSON.stringify({ stepId: currentStepId, decision, actualCalls, plannedCalls: routed.length, statusCounts: metrics.statusCounts, macro: metrics.macro, progressPath: join(campaignRoot, "progress.png"), stepDirectory: stepRoot })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});

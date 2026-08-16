import assert from "node:assert/strict";
import test from "node:test";

import {
  APPROVED_JUDGE_MODELS,
  CROSS_VALIDATION_JUDGE_MODELS,
  RELEASE_ID,
  createCandidateIdentity,
  createCaseManifest,
  createJudgmentRecord,
  createRunReceipt,
  parseCaseManifest,
  parseJudgmentRecord,
  parseRunReceipt,
  stableDigest,
} from "../src/contracts.ts";
import { caseSemantic } from "./fixtures.ts";

test("case, receipt, and judgment contracts bind their exact content", () => {
  const manifest = createCaseManifest(caseSemantic());
  assert.deepEqual(parseCaseManifest(manifest), manifest);
  assert.throws(
    () =>
      parseCaseManifest({
        ...manifest,
        task: { ...manifest.task, instruction: "substituted task" },
      }),
    /manifestDigest/i,
  );

  const candidate = createCandidateIdentity({
    candidateId: "neutral-system",
    harness: "external-harness",
    model: "external-model",
    host: "external-host",
    adaptation: "context-adapter",
    configurationDigest: stableDigest({ configuration: "2026.8.15" }),
    toolPolicyDigest: stableDigest({ tools: [] }),
  });
  const outputDigest = stableDigest({ output: "answer [source-001]" });
  const receipt = createRunReceipt({
    release: RELEASE_ID,
    benchCommit: "a".repeat(40),
    bankDigest: stableDigest({ bank: "fixture" }),
    trialId: "trial-001",
    caseId: manifest.caseId,
    manifestDigest: manifest.manifestDigest,
    taskDigest: stableDigest({ task: "trial-001" }),
    condition: "diagnostic_target_a",
    candidate,
    session: {
      sessionDigest: stableDigest({ session: "trial-001" }),
      order: 0,
      leakage: "passed",
      leakageCheckDigest: stableDigest({ leakage: "trial-001" }),
    },
    execution: {
      kind: "conversation",
      hostReceiptDigest: stableDigest({ host: "trial-001" }),
      transcriptDigest: stableDigest({ transcript: "trial-001" }),
      turnCount: 1,
      termination: "completed",
      cleanup: "succeeded",
    },
    state: "succeeded",
    artifact: {
      digest: outputDigest,
      bytes: 19,
      mediaType: "text/plain",
      validationDigest: stableDigest({ validation: "trial-001" }),
    },
    durationMs: 12,
    usage: null,
  });
  assert.deepEqual(parseRunReceipt(receipt), receipt);
  if (receipt.state !== "succeeded") throw new Error("fixture receipt failed");

  const judgment = createJudgmentRecord({
    release: RELEASE_ID,
    judgmentId: "judgment-001",
    trialIds: [receipt.trialId],
    caseId: manifest.caseId,
    runReceiptDigests: [receipt.receiptDigest],
    mode: "pointwise",
    dimension: "task_utility",
    orientation: null,
    artifactDigests: [outputDigest],
    artifactValidationDigests: [receipt.artifact.validationDigest],
    rubricDigest: manifest.sealed.rubricDigest,
    rubricProjectionId: "fixture",
    rubricProjectionDigest: stableDigest({ projection: "fixture" }),
    judgeConfigurationDigest: stableDigest({ judges: "qualified" }),
    primaryJudges: ["gpt-5.6-terra", "gpt-5.6-luna"],
    crossValidationJudges: CROSS_VALIDATION_JUDGE_MODELS,
    votes: APPROVED_JUDGE_MODELS.map((model, index) => ({
      model,
      resolvedModel: model,
      promptDigest: stableDigest({ model, prompt: 1 }),
      responseDigest: stableDigest({ model, response: 1 }),
      state: "measured" as const,
      verdict: "pass" as const,
      usage: null,
    })),
  });
  assert.deepEqual(parseJudgmentRecord(judgment), judgment);
  assert.deepEqual(judgment.outcome, { state: "measured", verdict: "pass" });
});

test("failure, abstention, disagreement, and unavailable judgments stay explicit", () => {
  const candidate = createCandidateIdentity({
    candidateId: "neutral-system",
    harness: "external-harness",
    model: "external-model",
    host: "external-host",
    adaptation: "context-adapter",
    configurationDigest: stableDigest({ configuration: "2026.8.15" }),
    toolPolicyDigest: stableDigest({ tools: [] }),
  });
  const failed = createRunReceipt({
    release: RELEASE_ID,
    benchCommit: "b".repeat(40),
    bankDigest: stableDigest({ bank: "fixture" }),
    trialId: "trial-failed",
    caseId: "case-talk-001",
    manifestDigest: stableDigest({ manifest: "case-talk-001" }),
    taskDigest: stableDigest({ task: "trial-failed" }),
    condition: "task_only",
    candidate,
    session: {
      sessionDigest: stableDigest({ session: "failed" }),
      order: 0,
      leakage: "unavailable",
      leakageCheckDigest: stableDigest({ leakage: "failed" }),
    },
    execution: null,
    state: "host_failed",
    cause: "isolated host did not start",
  });
  assert.equal(parseRunReceipt(failed).state, "host_failed");
  assert.equal("artifact" in failed, false);

  const base = {
    release: RELEASE_ID,
    judgmentId: "judgment-unavailable",
    trialIds: ["trial-left", "trial-right"],
    caseId: "case-talk-001",
    runReceiptDigests: [stableDigest("left"), stableDigest("right")],
    mode: "pairwise" as const,
    dimension: "target_alignment" as const,
    orientation: "canonical" as const,
    artifactDigests: [stableDigest("left"), stableDigest("right")] as const,
    artifactValidationDigests: [
      stableDigest("left validation"),
      stableDigest("right validation"),
    ] as const,
    rubricDigest: stableDigest("rubric"),
    rubricProjectionId: "fixture",
    rubricProjectionDigest: stableDigest("projection"),
    judgeConfigurationDigest: stableDigest("configuration"),
    primaryJudges: ["gpt-5.6-terra", "gpt-5.6-luna"] as const,
    crossValidationJudges: CROSS_VALIDATION_JUDGE_MODELS,
  };
  const unavailable = createJudgmentRecord({
    ...base,
    votes: APPROVED_JUDGE_MODELS.map((model, index) =>
      index === 0
        ? {
            model,
            state: "measured" as const,
            resolvedModel: model,
            promptDigest: stableDigest({ model, prompt: 2 }),
            responseDigest: stableDigest({ model, response: 2 }),
            verdict: "left" as const,
            usage: null,
          }
        : {
            model,
            state: "unavailable" as const,
            resolvedModel: null,
            promptDigest: stableDigest({ model, prompt: 2 }),
            responseDigest: null,
            cause: "provider unavailable",
            usage: null,
          },
    ),
  });
  assert.deepEqual(unavailable.outcome, { state: "unavailable" });
});

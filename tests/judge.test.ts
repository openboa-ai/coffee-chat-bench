import assert from "node:assert/strict";
import test from "node:test";

import {
  APPROVED_JUDGE_MODELS,
  CROSS_VALIDATION_JUDGE_MODELS,
  PRIMARY_JUDGE_MODELS,
  RELEASE_ID,
  createCandidateIdentity,
  createCaseManifest,
  createRunReceipt,
  stableDigest,
} from "../src/contracts.ts";
import {
  JUDGE_PROTOCOL,
  createJudgeRequest,
  judgeOutputs,
  parseJudgeConfiguration,
  type JudgeRequest,
  type JudgeTransport,
} from "../src/judge.ts";
import { renderCase, validateArtifact } from "../src/artifact.ts";
import { caseSemantic, judgeConfigurationFixture } from "./fixtures.ts";

const rubricProjection = { criteria: ["fixture"] };
const slot = {
  judgmentId: "judgment-pointwise-001",
  pairId: null,
  mode: "pointwise" as const,
  dimension: "target_alignment" as const,
  orientation: null,
  conditions: ["diagnostic_target_a"] as const,
  rubricProjection: {
    id: "fixture",
    digest: stableDigest(rubricProjection),
  },
  expectedVerdict: "pass" as const,
};

function successfulRun() {
  const manifest = createCaseManifest(caseSemantic());
  const task = renderCase(manifest, {
    trialId: "trial-judge-001",
    condition: "diagnostic_target_a",
  });
  const bytes = Buffer.from(
    "Prefer the reversible experiment because rollback remains cheap [source-001].",
  );
  const validation = validateArtifact(manifest, bytes);
  assert.equal(validation.state, "valid");
  if (validation.state !== "valid") throw new Error("fixture artifact invalid");
  const receipt = createRunReceipt({
    release: RELEASE_ID,
    benchCommit: "a".repeat(40),
    bankDigest: stableDigest({ bank: "judge" }),
    trialId: task.trialId,
    caseId: manifest.caseId,
    manifestDigest: manifest.manifestDigest,
    taskDigest: task.taskDigest,
    condition: "diagnostic_target_a",
    candidate: createCandidateIdentity({
      candidateId: "candidate-that-must-remain-blind",
      harness: "codex",
      model: "candidate-model",
      host: "harbor",
      adaptation: "direct_context",
      configurationDigest: stableDigest({ configuration: 1 }),
      toolPolicyDigest: stableDigest({ tools: [] }),
    }),
    session: {
      sessionDigest: stableDigest({ session: "judge" }),
      order: 0,
      leakage: "passed",
      leakageCheckDigest: stableDigest({ leakage: "judge" }),
    },
    execution: {
      kind: "conversation",
      hostReceiptDigest: stableDigest({ host: 1 }),
      transcriptDigest: stableDigest({ transcript: 1 }),
      turnCount: 1,
      termination: "completed",
      cleanup: "succeeded",
    },
    state: "succeeded",
    artifact: validation.artifact,
    durationMs: 20,
    usage: null,
  });
  return { manifest, receipt, bytes };
}

const configuration = judgeConfigurationFixture("judge fixture");

test("judge qualification evidence is bound to the protocol and study", () => {
  const studyDigest = stableDigest({ study: "current" });
  const qualifications = Object.fromEntries(
    APPROVED_JUDGE_MODELS.map((model) => {
      const qualificationEvidenceDigest = stableDigest({ model, studyDigest });
      const semantic = {
        release: RELEASE_ID,
        protocol: JUDGE_PROTOCOL,
        studyDigest,
        model,
        state: "qualified" as const,
        qualificationEvidenceDigest,
      };
      return [model, { ...semantic, evidenceDigest: stableDigest(semantic) }];
    }),
  );
  const bound = {
    protocol: JUDGE_PROTOCOL,
    studyDigest,
    primaryJudges: PRIMARY_JUDGE_MODELS,
    crossValidationJudges: CROSS_VALIDATION_JUDGE_MODELS,
    qualifications,
  };

  assert.doesNotThrow(() => parseJudgeConfiguration(bound));
  assert.throws(
    () =>
      parseJudgeConfiguration({
        ...bound,
        studyDigest: stableDigest({ study: "different" }),
      }),
    /qualification evidence binding/i,
  );
});

test("judge rejects a structurally valid configuration without qualification authority", async () => {
  const { manifest, receipt, bytes } = successfulRun();
  const unbound = parseJudgeConfiguration(
    JSON.parse(JSON.stringify(configuration)) as unknown,
  );
  let calls = 0;
  await assert.rejects(
    judgeOutputs(
      {
        manifest,
        slot,
        runs: [{ receipt, artifact: bytes }],
        rubricProjection,
        configuration: unbound,
      },
      async () => {
        calls += 1;
        return {
          state: "succeeded",
          resolvedModel: "gpt-5.6-terra",
          responseText: JSON.stringify({ verdict: "pass" }),
          usage: null,
        };
      },
    ),
    /qualified evidence report/i,
  );
  assert.equal(calls, 0);
});

test("judge is treatment-blind and resolves concordant frozen primary votes", async () => {
  const { manifest, receipt, bytes } = successfulRun();
  const requests: JudgeRequest[] = [];
  const transport: JudgeTransport = async (request) => {
    requests.push(request);
    return {
      state: "succeeded",
      resolvedModel: `${request.model}-resolved`,
      responseText: JSON.stringify({ verdict: "pass" }),
      usage: { inputTokens: 100, outputTokens: 5, costNanoUsd: 500 },
    };
  };

  const judgment = await judgeOutputs(
    {
      manifest,
      slot,
      runs: [{ receipt, artifact: bytes }],
      rubricProjection,
      configuration,
    },
    transport,
  );

  assert.deepEqual(judgment.outcome, { state: "measured", verdict: "pass" });
  assert.deepEqual(judgment.runReceiptDigests, [receipt.receiptDigest]);
  assert.equal(requests.length, 3);
  const transportWire = JSON.stringify(requests);
  assert.doesNotMatch(
    transportWire,
    /candidate-that-must-remain-blind|diagnostic_target_a|codex|harbor/u,
  );
  assert.doesNotMatch(transportWire, /"orientation"/u);
  const payload = JSON.parse(requests[0]!.input) as Record<string, unknown>;
  assert.deepEqual(Object.keys(payload).sort(), [
    "dimension",
    "evidence",
    "mode",
    "outputs",
    "protocol",
    "rubric",
    "task",
  ]);
  assert.deepEqual(payload.task, {
    instruction: manifest.task.instruction,
    output: manifest.task.output,
  });
  assert.deepEqual(
    payload.evidence,
    manifest.evidence.map(({ id, content }) => ({ id, content })),
  );
  const reordered = createJudgeRequest({
    outputs: payload.outputs,
    rubric: payload.rubric,
    evidence: payload.evidence,
    task: payload.task,
    dimension: slot.dimension,
    mode: slot.mode,
    protocol: configuration.protocol,
  });
  assert.equal(reordered.input, requests[0]!.input);
  assert.doesNotMatch(JSON.stringify(payload), /history-01|condition/u);
  assert.doesNotMatch(JSON.stringify(judgment), /rollback remains cheap/u);
  assert.throws(
    () =>
      parseJudgeConfiguration({
        ...configuration,
        protocol: "drifted-protocol",
      }),
    /protocol/i,
  );
});

test("judge preserves provider unavailability instead of assigning a score", async () => {
  const { manifest, receipt, bytes } = successfulRun();
  const transport: JudgeTransport = async (request) =>
    request.model === "gpt-5.6-terra"
      ? {
          state: "succeeded",
          resolvedModel: request.model,
          responseText: JSON.stringify({ verdict: "pass" }),
          usage: null,
        }
      : {
          state: "unavailable",
          resolvedModel: null,
          cause: "provider unavailable",
        };

  const judgment = await judgeOutputs(
    {
      manifest,
      slot: {
        ...slot,
        judgmentId: "judgment-unavailable-001",
        dimension: "task_utility",
      },
      runs: [{ receipt, artifact: bytes }],
      rubricProjection,
      configuration,
    },
    transport,
  );

  assert.equal(judgment.outcome.state, "unavailable");
});

test("primary disagreement remains nonnumeric", async () => {
  const { manifest, receipt, bytes } = successfulRun();
  const judgment = await judgeOutputs(
    {
      manifest,
      slot: { ...slot, judgmentId: "judgment-primary-disagreement-001" },
      runs: [{ receipt, artifact: bytes }],
      rubricProjection,
      configuration,
    },
    async (request) => ({
      state: "succeeded",
      resolvedModel: request.model,
      responseText: JSON.stringify({
        verdict: request.model === "gpt-5.6-luna" ? "fail" : "pass",
      }),
      usage: null,
    }),
  );
  assert.deepEqual(judgment.outcome, { state: "disagreement" });
  assert.deepEqual(judgment.primaryJudges, configuration.primaryJudges);
});

test("cross-validation disagreement remains nonnumeric", async () => {
  const { manifest, receipt, bytes } = successfulRun();
  const judgment = await judgeOutputs(
    {
      manifest,
      slot: {
        ...slot,
        judgmentId: "judgment-cross-validation-disagreement-001",
      },
      runs: [{ receipt, artifact: bytes }],
      rubricProjection,
      configuration,
    },
    async (request) => ({
      state: "succeeded",
      resolvedModel: request.model,
      responseText: JSON.stringify({
        verdict: request.model === "gpt-5.6-sol" ? "fail" : "pass",
      }),
      usage: null,
    }),
  );

  assert.deepEqual(judgment.outcome, { state: "disagreement" });
  assert.ok(judgment.votes.some(({ model }) => model === "gpt-5.6-sol"));
});

test("judge excludes a successful artifact when isolation cleanup failed", async () => {
  const { manifest, receipt, bytes } = successfulRun();
  if (receipt.state !== "succeeded") throw new Error("fixture receipt failed");
  if (receipt.execution === null) throw new Error("fixture execution missing");
  const { receiptDigest: _receiptDigest, ...semantic } = receipt;
  const cleanupFailed = createRunReceipt({
    ...semantic,
    execution: { ...receipt.execution, cleanup: "failed" },
  });
  let calls = 0;
  await assert.rejects(
    judgeOutputs(
      {
        manifest,
        slot: { ...slot, judgmentId: "judgment-cleanup-failed-001" },
        runs: [{ receipt: cleanupFailed, artifact: bytes }],
        rubricProjection,
        configuration,
      },
      async () => {
        calls += 1;
        throw new Error("transport must not run");
      },
    ),
    /cleanup|isolation/i,
  );
  assert.equal(calls, 0);
});

test("judge revalidates supplied output bytes against the case contract", async () => {
  const { manifest, receipt } = successfulRun();
  let calls = 0;
  await assert.rejects(
    judgeOutputs(
      {
        manifest,
        slot: { ...slot, judgmentId: "judgment-artifact-mismatch-001" },
        runs: [{ receipt, artifact: Buffer.from("uncited replacement") }],
        rubricProjection,
        configuration,
      },
      async () => {
        calls += 1;
        throw new Error("transport must not run");
      },
    ),
    /artifact validation mismatch/i,
  );
  assert.equal(calls, 0);
});

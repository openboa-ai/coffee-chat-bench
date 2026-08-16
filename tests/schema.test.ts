import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

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

const schema = JSON.parse(
  readFileSync(
    new URL("../schemas/benchmark.schema.json", import.meta.url),
    "utf8",
  ),
) as object;
const Ajv = Ajv2020 as unknown as new (options: unknown) => {
  compile: (value: object) => { (value: unknown): boolean; errors: unknown };
};
const validate = new Ajv({ strict: false }).compile(schema);

function fixtures() {
  const manifest = createCaseManifest(caseSemantic());
  const candidate = createCandidateIdentity({
    candidateId: "schema-candidate",
    harness: "schema-harness",
    model: "schema-model",
    host: "schema-host",
    adaptation: "schema-adaptation",
    configurationDigest: stableDigest({ configuration: "schema" }),
    toolPolicyDigest: stableDigest({ tools: [] }),
  });
  const receipt = createRunReceipt({
    release: RELEASE_ID,
    benchCommit: "a".repeat(40),
    bankDigest: stableDigest({ bank: "schema" }),
    trialId: "schema-trial",
    caseId: manifest.caseId,
    manifestDigest: manifest.manifestDigest,
    taskDigest: stableDigest({ task: "schema" }),
    condition: "task_only",
    candidate,
    session: {
      sessionDigest: stableDigest({ session: "schema" }),
      order: 0,
      leakage: "unavailable",
      leakageCheckDigest: stableDigest({ leakage: "schema" }),
    },
    execution: null,
    state: "unavailable",
    cause: "schema fixture unavailable",
  });
  const judgment = createJudgmentRecord({
    release: RELEASE_ID,
    judgmentId: "schema-judgment",
    trialIds: ["schema-trial"],
    caseId: manifest.caseId,
    runReceiptDigests: [receipt.receiptDigest],
    mode: "pointwise",
    dimension: "target_alignment",
    orientation: null,
    artifactDigests: [stableDigest({ artifact: "schema" })],
    artifactValidationDigests: [stableDigest({ validation: "schema" })],
    rubricDigest: manifest.sealed.rubricDigest,
    rubricProjectionId: "schema",
    rubricProjectionDigest: stableDigest({ projection: "schema" }),
    judgeConfigurationDigest: stableDigest({ judge: "schema" }),
    primaryJudges: ["gpt-5.6-terra", "gpt-5.6-luna"],
    crossValidationJudges: CROSS_VALIDATION_JUDGE_MODELS,
    votes: APPROVED_JUDGE_MODELS.map((model) => ({
      model,
      state: "unavailable" as const,
      resolvedModel: null,
      promptDigest: stableDigest({ model }),
      responseDigest: null,
      cause: "schema fixture unavailable",
      usage: null,
    })),
  });
  const unmeasured = {
    state: "unmeasured" as const,
    numerator: 0 as const,
    denominator: 0 as const,
    value: null,
  };
  const reportSemantic = {
    release: RELEASE_ID,
    benchCommit: "a".repeat(40),
    bankDigest: receipt.bankDigest,
    candidate,
    provenance: {
      bankId: "schema-bank",
      protocolDigest: stableDigest({ protocol: "schema" }),
      judgeConfigurationDigest: stableDigest({ judge: "schema" }),
    },
    forms: [
      {
        split: "release_a",
        form: "dialogue",
        census: {
          families: 1,
          measured: 0,
          receipts: { missing: 5 },
          cleanup: {},
          judgments: { missing: 1 },
          family: { unavailable: 1 },
        },
        targetAlignment: unmeasured,
        taskUtility: unmeasured,
        evidenceIntegrity: unmeasured,
        targetSpecificity: unmeasured,
        criticalFailureRate: unmeasured,
        qpcfr: unmeasured,
        efficiency: {
          state: "unmeasured",
          samples: 0,
          durationMsMean: null,
          inputTokensMean: null,
          outputTokensMean: null,
          costNanoUsdTotal: null,
        },
        caseCensus: [
          {
            caseId: manifest.caseId,
            familyId: manifest.familyId,
            manifestDigest: manifest.manifestDigest,
            familyState: "unavailable",
            trials: (
              [
                "task_only",
                "nondiagnostic_target_a",
                "nondiagnostic_target_b",
                "diagnostic_target_a",
                "diagnostic_target_b",
              ] as const
            ).map((condition) => ({
              condition,
              trialId: null,
              receiptDigest: null,
              receiptState: "missing",
              artifactValidationDigest: null,
              session: null,
              cleanup: "not_applicable",
              judgmentRecordDigests: [],
            })),
          },
        ],
        coverage: {
          observedReceipts: 0,
          semanticEligibleReceipts: 0,
          judgedRecords: 0,
          numericFamilies: 0,
        },
        uncertainty: {
          unmeasuredFamilies: 1,
          qpcfrLowerBound: 0,
          qpcfrUpperBound: 1,
        },
      },
    ],
  };
  const report = {
    ...reportSemantic,
    reportDigest: stableDigest(reportSemantic),
  };
  return { manifest, receipt, judgment, report };
}

test("public schema and runtime agree on contract branches and context cardinality", () => {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { exports?: Record<string, string> };
  assert.deepEqual(packageJson.exports, {
    ".": "./src/benchmark-contracts.ts",
    "./schema": "./schemas/benchmark.schema.json",
  });
  const { manifest, receipt, judgment, report } = fixtures();
  for (const [value, parser] of [
    [manifest, parseCaseManifest],
    [receipt, parseRunReceipt],
    [judgment, parseJudgmentRecord],
  ] as const) {
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
    assert.deepEqual(parser(value), value);
  }
  assert.equal(validate(report), true, JSON.stringify(validate.errors));

  if (receipt.state !== "unavailable") throw new Error("fixture receipt state");
  const {
    receiptDigest: _receiptDigest,
    cause: _cause,
    ...receiptSemantic
  } = receipt;
  const succeededWithoutIsolation = {
    ...receiptSemantic,
    state: "succeeded" as const,
    execution: null,
    artifact: {
      digest: stableDigest({ artifact: "schema" }),
      bytes: 1,
      mediaType: "text/plain" as const,
      validationDigest: stableDigest({ validation: "schema" }),
    },
    durationMs: 1,
    usage: null,
    receiptDigest: receipt.receiptDigest,
  };
  assert.equal(validate(succeededWithoutIsolation), false);
  const { receiptDigest: _invalidDigest, ...invalidReceiptSemantic } =
    succeededWithoutIsolation;
  assert.throws(
    () => createRunReceipt(invalidReceiptSemantic),
    /execution evidence/i,
  );
  const zeroTurn = {
    ...succeededWithoutIsolation,
    execution: {
      kind: "conversation" as const,
      hostReceiptDigest: stableDigest({ host: "schema" }),
      transcriptDigest: stableDigest({ transcript: "schema" }),
      turnCount: 0,
      termination: "completed" as const,
      cleanup: "succeeded" as const,
    },
  };
  assert.equal(validate(zeroTurn), false);
  const { receiptDigest: _zeroDigest, ...zeroTurnSemantic } = zeroTurn;
  assert.throws(() => createRunReceipt(zeroTurnSemantic), /turnCount/i);

  const {
    outcome: _outcome,
    recordDigest: _recordDigest,
    ...judgmentInput
  } = judgment;
  const pointwiseWithPairCardinality = {
    ...judgment,
    trialIds: ["left", "right"],
    runReceiptDigests: [stableDigest("left"), stableDigest("right")],
    artifactDigests: [
      stableDigest("left artifact"),
      stableDigest("right artifact"),
    ],
    artifactValidationDigests: [
      stableDigest("left validation"),
      stableDigest("right validation"),
    ],
  };
  assert.equal(validate(pointwiseWithPairCardinality), false);
  assert.throws(
    () =>
      createJudgmentRecord({
        ...judgmentInput,
        trialIds: pointwiseWithPairCardinality.trialIds,
        runReceiptDigests: pointwiseWithPairCardinality.runReceiptDigests,
        artifactDigests: pointwiseWithPairCardinality.artifactDigests,
        artifactValidationDigests:
          pointwiseWithPairCardinality.artifactValidationDigests,
      }),
    /artifact count|cardinality/i,
  );

  const contextViolation = structuredClone(manifest) as unknown as {
    contexts: Record<string, unknown>;
  };
  contextViolation.contexts.task_only = [
    { id: "unexpected", content: "task only must remain empty" },
  ];
  assert.equal(validate(contextViolation), false);
  assert.throws(
    () =>
      createCaseManifest({
        ...caseSemantic(),
        contexts: contextViolation.contexts as typeof manifest.contexts,
      }),
    /task_only context/i,
  );
});

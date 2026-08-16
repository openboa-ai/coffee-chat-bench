import assert from "node:assert/strict";
import test from "node:test";

import { renderCase, validateArtifact } from "../src/artifact.ts";
import { createBankManifest } from "../src/bank.ts";
import {
  APPROVED_JUDGE_MODELS,
  BENCHMARK_CONDITIONS,
  RELEASE_ID,
  createCandidateIdentity,
  createCaseManifest,
  createJudgmentRecord,
  createRunReceipt,
  stableDigest,
  type BenchmarkCondition,
  type JudgmentSemanticInput,
  type JudgeVerdict,
  type RunReceipt,
} from "../src/contracts.ts";
import { deriveBenchmarkReport } from "../src/metrics.ts";
import { caseSemantic, judgeConfigurationFixture } from "./fixtures.ts";

const rubric = {
  projections: {
    general: { criteria: ["fixture general"] },
    target_a: { criteria: ["fixture target A"] },
    target_b: { criteria: ["fixture target B"] },
  },
};
const projection = (id: keyof typeof rubric.projections) => ({
  id,
  digest: stableDigest(rubric.projections[id]),
});
const point = (
  judgmentId: string,
  dimension: JudgmentSemanticInput["dimension"],
  condition: BenchmarkCondition,
  expectedVerdict: "pass" | "fail" = "pass",
) => ({
  judgmentId,
  pairId: null,
  mode: "pointwise" as const,
  dimension,
  orientation: null,
  conditions: [condition],
  rubricProjection: projection("general"),
  expectedVerdict,
});
const pair = (
  pairId: string,
  dimension: JudgmentSemanticInput["dimension"],
  conditions: readonly [BenchmarkCondition, BenchmarkCondition],
  expectedVerdict: "left" | "right" | "tie" | "left_or_tie" | "right_or_tie",
  rubricProjection: ReturnType<typeof projection>,
) => [
  {
    judgmentId: `${pairId}-canonical`,
    pairId,
    mode: "pairwise" as const,
    dimension,
    orientation: "canonical" as const,
    conditions,
    rubricProjection,
    expectedVerdict,
  },
  {
    judgmentId: `${pairId}-mirrored`,
    pairId,
    mode: "pairwise" as const,
    dimension,
    orientation: "mirrored" as const,
    conditions: [conditions[1], conditions[0]],
    rubricProjection,
    expectedVerdict:
      expectedVerdict === "left"
        ? "right"
        : expectedVerdict === "right"
          ? "left"
          : expectedVerdict === "left_or_tie"
            ? "right_or_tie"
            : expectedVerdict === "right_or_tie"
              ? "left_or_tie"
              : "tie",
  },
];
const defaultPlan = {
  authority: "project_author_hypothesis" as const,
  humanReviewed: false as const,
  use: "prospective_contrast_definition" as const,
  judgmentPlan: [
    point("task-utility", "task_utility", "task_only"),
    point("evidence-integrity", "evidence_integrity", "task_only"),
    ...BENCHMARK_CONDITIONS.map((condition) =>
      point(`critical-${condition}`, "critical_failure", condition),
    ),
    ...pair(
      "alignment-a",
      "target_alignment",
      ["diagnostic_target_a", "nondiagnostic_target_a"],
      "left",
      projection("target_a"),
    ),
    ...pair(
      "alignment-b",
      "target_alignment",
      ["diagnostic_target_b", "nondiagnostic_target_b"],
      "left",
      projection("target_b"),
    ),
    ...pair(
      "cross-score-a",
      "target_specificity",
      ["diagnostic_target_a", "diagnostic_target_b"],
      "left",
      projection("target_a"),
    ),
    ...pair(
      "cross-score-b",
      "target_specificity",
      ["diagnostic_target_a", "diagnostic_target_b"],
      "right",
      projection("target_b"),
    ),
  ],
};
const configuration = judgeConfigurationFixture("report fixture");

function fixture(plan: typeof defaultPlan = defaultPlan) {
  const manifest = createCaseManifest({
    ...caseSemantic(),
    split: "release_a",
    sealed: {
      rubricDigest: stableDigest(rubric),
      judgmentPlanDigest: stableDigest(plan),
    },
  });
  const candidate = createCandidateIdentity({
    candidateId: "candidate-neutral-system",
    harness: "external-harness",
    model: "external-model",
    host: "external-host",
    adaptation: "context-adapter",
    configurationDigest: stableDigest({ configuration: "2026.8.15" }),
    toolPolicyDigest: stableDigest({ tools: [] }),
  });
  const bankManifest = createBankManifest({
    release: RELEASE_ID,
    bankId: "literal-fixture-bank",
    license: "MIT",
    protocolDigest: stableDigest({ protocol: "fixture" }),
    cases: [
      {
        caseId: manifest.caseId,
        familyId: manifest.familyId,
        form: manifest.form,
        split: manifest.split,
        casePath: "cases/case.json",
        manifestDigest: manifest.manifestDigest,
        rubricPath: "evaluator/rubrics/case.json",
        rubricDigest: manifest.sealed.rubricDigest,
        judgmentPlanPath: "evaluator/plans/case.json",
        judgmentPlanDigest: manifest.sealed.judgmentPlanDigest,
      },
    ],
  });
  const bank = {
    manifest: bankManifest,
    cases: [{ entry: bankManifest.cases[0]!, manifest, rubric, plan: plan }],
  };
  const run = (condition: BenchmarkCondition): RunReceipt => {
    const task = renderCase(manifest, {
      trialId: `trial-${condition}`,
      condition,
    });
    const validation = validateArtifact(
      manifest,
      Buffer.from(`A cited response for ${condition} [source-001].`, "utf8"),
    );
    assert.equal(validation.state, "valid");
    if (validation.state !== "valid")
      throw new Error("invalid fixture artifact");
    return createRunReceipt({
      release: RELEASE_ID,
      benchCommit: "a".repeat(40),
      bankDigest: bank.manifest.bankDigest,
      trialId: task.trialId,
      caseId: manifest.caseId,
      manifestDigest: manifest.manifestDigest,
      taskDigest: task.taskDigest,
      condition,
      candidate,
      session: {
        sessionDigest: stableDigest({ session: condition }),
        order: BENCHMARK_CONDITIONS.indexOf(condition),
        leakage: "passed",
        leakageCheckDigest: stableDigest({ leakage: condition }),
      },
      execution: {
        kind: "conversation",
        hostReceiptDigest: stableDigest({ host: condition }),
        transcriptDigest: stableDigest({ transcript: condition }),
        turnCount: 1,
        termination: "completed",
        cleanup: "succeeded",
      },
      state: "succeeded",
      artifact: validation.artifact,
      durationMs: 12,
      usage: null,
    });
  };
  const receipts = BENCHMARK_CONDITIONS.map(run);
  const judgment = (
    judgmentId: string,
    verdict?: "pass" | "fail" | "left" | "right" | "tie",
    receiptSet: readonly RunReceipt[] = receipts,
  ) => {
    const slot = plan.judgmentPlan.find(
      (entry) => entry.judgmentId === judgmentId,
    )!;
    const runs = slot.conditions.map((condition) =>
      receiptSet.find((receipt) => receipt.condition === condition)!,
    );
    if (runs.some((receipt) => receipt.state !== "succeeded"))
      throw new Error("fixture receipt failed");
    const succeeded = runs as Extract<RunReceipt, { state: "succeeded" }>[];
    const vote = (verdict ?? slot.expectedVerdict) as JudgeVerdict;
    return createJudgmentRecord({
      release: RELEASE_ID,
      judgmentId: slot.judgmentId,
      trialIds: succeeded.map((receipt) => receipt.trialId),
      caseId: manifest.caseId,
      runReceiptDigests: succeeded.map((receipt) => receipt.receiptDigest),
      mode: slot.mode,
      dimension: slot.dimension,
      orientation: slot.orientation,
      artifactDigests: succeeded.map((receipt) => receipt.artifact.digest),
      artifactValidationDigests: succeeded.map(
        (receipt) => receipt.artifact.validationDigest,
      ),
      rubricDigest: manifest.sealed.rubricDigest,
      rubricProjectionId: slot.rubricProjection.id,
      rubricProjectionDigest: slot.rubricProjection.digest,
      judgeConfigurationDigest: stableDigest(configuration),
      primaryJudges: configuration.primaryJudges,
      crossValidationJudges: configuration.crossValidationJudges,
      votes: APPROVED_JUDGE_MODELS.map((model) => ({
        model,
        state: "measured" as const,
        resolvedModel: model,
        promptDigest: stableDigest({ model, judgmentId }),
        responseDigest: stableDigest({ model, vote }),
        verdict: vote,
        usage: null,
      })),
    });
  };
  return { manifest, candidate, bank, receipts, judgment };
}

function input(value: ReturnType<typeof fixture>, judgments: unknown[]) {
  return {
    benchCommit: "a".repeat(40),
    candidate: value.candidate,
    bank: value.bank,
    judgeConfiguration: configuration,
    receipts: value.receipts,
    judgments,
  };
}

test("report binds the complete validated bank census and recomputed task digests", () => {
  const value = fixture();
  assert.equal(
    deriveBenchmarkReport(input(value, [])).forms[0]!.qpcfr.state,
    "unmeasured",
  );
  assert.throws(
    () =>
      deriveBenchmarkReport({
        ...input(value, []),
        receipts: [
          { ...value.receipts[0]!, taskDigest: stableDigest("wrong") },
        ],
      }),
    /task digest|receipt/i,
  );
});

test("report rejects a judgment outside the sealed per-case slot plan", () => {
  const value = fixture();
  const valid = value.judgment("task-utility");
  const { outcome: _outcome, recordDigest: _recordDigest, ...semantic } = valid;
  const extra = createJudgmentRecord({
    ...semantic,
    judgmentId: "undeclared-slot",
  });
  assert.throws(
    () => deriveBenchmarkReport(input(value, [extra])),
    /declared judgment-plan slot/i,
  );
  const crossScore = value.judgment("cross-score-a-canonical");
  const {
    outcome: _crossOutcome,
    recordDigest: _crossDigest,
    ...crossInput
  } = crossScore;
  const wrongProjection = createJudgmentRecord({
    ...crossInput,
    rubricProjectionId: "target_b",
    rubricProjectionDigest: projection("target_b").digest,
  });
  assert.throws(
    () => deriveBenchmarkReport(input(value, [wrongProjection])),
    /rubric projection|sealed slot/i,
  );
});

test("report binds bidirectional cross-scores and collapses mirrored pair outcomes", () => {
  const value = fixture();
  const records = defaultPlan.judgmentPlan.map(({ judgmentId }) =>
    value.judgment(judgmentId),
  );
  const report = deriveBenchmarkReport(input(value, records));
  assert.equal(report.forms.length, 1);
  assert.equal(report.forms[0]!.split, "release_a");
  assert.deepEqual(report.forms[0]!.targetSpecificity, {
    state: "measured",
    numerator: 2,
    denominator: 2,
    value: 1,
  });
  const inconsistent = records.map((record) =>
    record.judgmentId === "alignment-a-mirrored"
      ? value.judgment(record.judgmentId, "left")
      : record,
  );
  const unmeasured = deriveBenchmarkReport(input(value, inconsistent));
  assert.equal(unmeasured.forms[0]!.qpcfr.state, "unmeasured");
  assert.equal(unmeasured.forms[0]!.census.family.unavailable, 1);
});

test("task context must be non-inferior, not predeclared as utility improvement", () => {
  const noninferiorityPlan = {
    ...defaultPlan,
    judgmentPlan: [
      ...defaultPlan.judgmentPlan,
      ...pair(
        "utility-noninferiority",
        "task_utility",
        ["diagnostic_target_a", "task_only"],
        "left_or_tie",
        projection("general"),
      ),
    ],
  };
  const value = fixture(noninferiorityPlan);
  const tied = noninferiorityPlan.judgmentPlan.map(({ judgmentId, pairId }) =>
    pairId === "utility-noninferiority"
      ? value.judgment(judgmentId, "tie")
      : value.judgment(judgmentId),
  );
  assert.equal(
    deriveBenchmarkReport(input(value, tied)).forms[0]!.qpcfr.value,
    1,
  );

  const worse = noninferiorityPlan.judgmentPlan.map(
    ({ judgmentId, pairId, orientation }) =>
      pairId === "utility-noninferiority"
        ? value.judgment(
            judgmentId,
            orientation === "canonical" ? "right" : "left",
          )
        : value.judgment(judgmentId),
  );
  assert.equal(
    deriveBenchmarkReport(input(value, worse)).forms[0]!.qpcfr.value,
    0,
  );
});

test("report leaves QPCFR nonnumeric when a fixed score dimension is undeclared", () => {
  const incompletePlan = {
    ...defaultPlan,
    judgmentPlan: defaultPlan.judgmentPlan.filter(
      ({ dimension }) => dimension !== "evidence_integrity",
    ),
  };
  const value = fixture(incompletePlan);
  const records = incompletePlan.judgmentPlan.map(({ judgmentId }) =>
    value.judgment(judgmentId),
  );

  const report = deriveBenchmarkReport(input(value, records));
  assert.equal(report.forms[0]!.qpcfr.state, "unmeasured");
  assert.equal(report.forms[0]!.census.family.unavailable, 1);
});

test("report treats equal valid pair artifacts as a semantic tie", () => {
  const value = fixture();
  const source = value.receipts.find(
    (receipt) => receipt.condition === "diagnostic_target_a",
  )!;
  const replacement = value.receipts.find(
    (receipt) => receipt.condition === "diagnostic_target_b",
  )!;
  if (source.state !== "succeeded" || replacement.state !== "succeeded")
    throw new Error("fixture receipt failed");
  const { receiptDigest: _replacementDigest, ...semantic } = replacement;
  const equalArtifact = createRunReceipt({
    ...semantic,
    artifact: source.artifact,
  });
  const receipts = value.receipts.map((receipt) =>
    receipt.condition === "diagnostic_target_b" ? equalArtifact : receipt,
  );
  const records = defaultPlan.judgmentPlan.map(({ judgmentId }) =>
    value.judgment(judgmentId, undefined, receipts),
  );

  const report = deriveBenchmarkReport({ ...input(value, records), receipts });
  assert.equal(report.forms[0]!.qpcfr.value, 0);
  assert.equal(report.forms[0]!.census.family.failed, 1);
});

test("report keeps release waves separate and excludes qualification from candidate scoring", () => {
  const value = fixture();
  const releaseB = createCaseManifest({
    ...caseSemantic(),
    caseId: "case-talk-release-b-001",
    familyId: "family-release-b-001",
    split: "release_b",
    lineage: {
      sourceIds: ["release-b-source"],
      templateId: "release-b-template",
      rubricTemplateId: "release-b-rubric-template",
    },
    sealed: value.manifest.sealed,
  });
  const qualification = createCaseManifest({
    ...caseSemantic(),
    caseId: "case-talk-qualification-001",
    familyId: "family-qualification-001",
    targetPairBlockId: "qualification-block-001",
    split: "judge_qualification",
    lineage: {
      sourceIds: ["qualification-source"],
      templateId: "qualification-template",
      rubricTemplateId: "qualification-rubric-template",
    },
    sealed: value.manifest.sealed,
  });
  const entry = (manifest: typeof value.manifest, stem: string) => ({
    caseId: manifest.caseId,
    familyId: manifest.familyId,
    form: manifest.form,
    split: manifest.split,
    casePath: `cases/${stem}.json`,
    manifestDigest: manifest.manifestDigest,
    rubricPath: `evaluator/rubrics/${stem}.json`,
    rubricDigest: manifest.sealed.rubricDigest,
    judgmentPlanPath: `evaluator/plans/${stem}.json`,
    judgmentPlanDigest: manifest.sealed.judgmentPlanDigest,
  });
  const manifest = createBankManifest({
    release: RELEASE_ID,
    bankId: value.bank.manifest.bankId,
    license: "MIT",
    protocolDigest: value.bank.manifest.protocolDigest,
    cases: [
      entry(value.manifest, "a"),
      entry(releaseB, "b"),
      entry(qualification, "qualification"),
    ],
  });
  const bank = {
    manifest,
    cases: [
      {
        entry: manifest.cases[0]!,
        manifest: value.manifest,
        rubric,
        plan: defaultPlan,
      },
      {
        entry: manifest.cases[1]!,
        manifest: releaseB,
        rubric,
        plan: defaultPlan,
      },
      {
        entry: manifest.cases[2]!,
        manifest: qualification,
        rubric,
        plan: defaultPlan,
      },
    ],
  };
  const receipts = value.receipts.map(
    ({ receiptDigest: _receiptDigest, ...semantic }) =>
      createRunReceipt({ ...semantic, bankDigest: manifest.bankDigest }),
  );
  const report = deriveBenchmarkReport({ ...input(value, []), bank, receipts });
  assert.deepEqual(
    report.forms.map(({ split, coverage }) => [
      split,
      coverage.observedReceipts,
    ]),
    [
      ["release_a", 5],
      ["release_b", 0],
    ],
  );
});

test("critical coverage and session failures remain explicit and nonnumeric", () => {
  const value = fixture();
  const records = defaultPlan.judgmentPlan.map(({ judgmentId }) =>
    value.judgment(judgmentId),
  );
  const failed = deriveBenchmarkReport(
    input(
      value,
      records.map((record) =>
        record.judgmentId === "critical-task_only"
          ? value.judgment(record.judgmentId, "fail")
          : record,
      ),
    ),
  );
  assert.equal(failed.forms[0]!.qpcfr.value, 0);
  assert.equal(failed.forms[0]!.criticalFailureRate.value, 1 / 5);
  const receipt = value.receipts[0]!;
  if (receipt.state !== "succeeded") throw new Error("fixture receipt failed");
  const { receiptDigest: _receiptDigest, ...semantic } = receipt;
  for (const [name, session] of [
    ["leakage", { ...receipt.session, leakage: "failed" as const }],
    ["duplicate order", { ...receipt.session, order: 1 }],
  ] as const) {
    const invalid = createRunReceipt({ ...semantic, session });
    const report = deriveBenchmarkReport({
      ...input(value, []),
      receipts: [invalid, ...value.receipts.slice(1)],
    });
    assert.equal(report.forms[0]!.qpcfr.state, "unmeasured", name);
    assert.equal(report.forms[0]!.census.family.unavailable, 1, name);
  }
});

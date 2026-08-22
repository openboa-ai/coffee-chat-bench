import assert from "node:assert/strict";
import test from "node:test";

import { computeQualificationMetrics } from "../scripts/qualification-metrics.mjs";

const measured = (score) => ({ state: "measured", score });

test("numeric qualification metrics use tie-aware Spearman and within-one-level accuracy", () => {
  const rows = [1, 1, 2, 3].map((reference, index) => ({
    dimension: "judgment_alignment",
    reference: { score: reference },
    result: measured([1, 2, 2, 3][index]),
  }));
  const block = computeQualificationMetrics(rows).dimensions.judgment_alignment;

  assert.equal(block.exactAgreement.value, 0.75);
  assert.equal(block.withinOneLevelAccuracy.value, 1);
  assert.equal(block.mae.value, 0.25);
  assert.equal(block.signedBias.value, 0.25);
  assert.ok(Math.abs(block.spearman.value - 5 / 6) < 1e-12);
});

test("binary qualification metrics expose recall, precision, specificity, and MCC", () => {
  const rows = [true, false, true, false].map((reference, index) => ({
    dimension: "hard_constraint_violation",
    reference,
    result: { state: "measured", detected: [true, false, false, false][index] },
  }));
  const block =
    computeQualificationMetrics(rows).dimensions.hard_constraint_violation;

  assert.deepEqual(block.confusion, {
    truePositive: 1,
    trueNegative: 2,
    falsePositive: 0,
    falseNegative: 1,
  });
  assert.equal(block.criticalRecall.value, 0.5);
  assert.equal(block.criticalPrecision.value, 1);
  assert.equal(block.criticalSpecificity.value, 1);
  assert.ok(Math.abs(block.criticalMcc.value - 1 / Math.sqrt(3)) < 1e-12);
});

test("undefined correlation and coverage remain explicit null states", () => {
  const metrics = computeQualificationMetrics([
    {
      dimension: "evidence_grounding",
      reference: { score: 4 },
      result: { state: "unavailable" },
    },
  ]).dimensions.evidence_grounding;

  assert.equal(metrics.coverage.value, 0);
  assert.equal(metrics.exactAgreement.value, null);
  assert.equal(metrics.spearman.value, null);
  assert.equal(metrics.pearson.value, null);
  assert.equal(metrics.withinOneLevelAccuracy.value, null);
  assert.equal(metrics.unavailableRate.value, 1);
});

test("macro ordinal metrics include all seven independently measured Judges", () => {
  const rows = [];
  const ordinalDimensions = [
    "judgment_alignment",
    "task_performance",
    "evidence_grounding",
  ];
  for (const dimension of ordinalDimensions)
    for (let index = 0; index < 2; index += 1)
      rows.push({
        dimension,
        reference: { score: index + 3 },
        result: measured(index + 3),
      });
  for (const facet of [
    "cueUtilization",
    "cueWeighting",
    "contextSensitivity",
    "actionConsistency",
  ])
    for (let index = 0; index < 2; index += 1)
      rows.push({
        dimension: "stated_rationale_alignment",
        reference: { [facet]: { score: index + 3 } },
        result: { state: "measured", score: { [facet]: index + 3 } },
      });

  const metrics = computeQualificationMetrics(rows);
  assert.equal(metrics.macro.qwk.value, 1);
  assert.equal(metrics.macro.exactAgreement.value, 1);
  assert.equal(metrics.macro.mae.value, 0);
});

test("output-token efficiency is nonnumeric when any routed call lacks usage", () => {
  const metrics = computeQualificationMetrics([
    {
      dimension: "task_performance",
      reference: { score: 4 },
      result: measured(4),
      outputTokens: 120,
    },
    {
      dimension: "task_performance",
      reference: { score: 3 },
      result: measured(3),
      outputTokens: null,
    },
  ]);

  assert.equal(metrics.meanOutputTokens.value, null);
  assert.match(metrics.meanOutputTokens.reason, /missing output token usage/u);
  assert.equal(
    metrics.dimensions.task_performance.meanOutputTokens.value,
    null,
  );
});

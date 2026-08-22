import assert from "node:assert/strict";
import test from "node:test";

import { buildQualificationReadiness } from "../scripts/qualification-readiness.mjs";

test("qualification readiness has balanced hard controls and supported semantic dimensions", async () => {
  const report = await buildQualificationReadiness(".");

  assert.equal(report.status, "ready_for_new_baseline");
  assert.equal(report.publicBankStatus, "not_active");
  assert.equal(report.gatePolicyId, "absolute-all-metric-gate-2026.8.20");
  assert.equal(report.corpusCensus.submissions, 144);
  assert.deepEqual(report.measurementCensus, {
    total: 624,
    submissions: 144,
    dimensions: {
      judgment_alignment: 96,
      stated_rationale_alignment: 96,
      task_performance: 144,
      evidence_grounding: 144,
      hard_constraint_violation: 144,
    },
    conditions: { target_a: 240, target_b: 240, unconditioned: 144 },
  });
  assert.deepEqual(report.hardConstraintSupport, {
    total: 144,
    measured: 144,
    positives: 18,
    negatives: 126,
    conditions: {
      unconditioned: { total: 48, measured: 48, positives: 9, negatives: 39 },
      target_a: { total: 48, measured: 48, positives: 5, negatives: 43 },
      target_b: { total: 48, measured: 48, positives: 4, negatives: 44 },
    },
    criticalRecallSupported: true,
    mccSupported: true,
  });
  for (const dimension of [
    "judgment_alignment",
    "task_performance",
    "evidence_grounding",
  ]) {
    assert.equal(
      report.dimensions[dimension].census,
      dimension === "judgment_alignment" ? 96 : 144,
    );
    assert.equal(report.dimensions[dimension].support.meetsMinimum, true);
    assert.deepEqual(
      report.dimensions[dimension].support.levels,
      [1, 2, 3, 4, 5],
    );
  }
  for (const facet of [
    "cueUtilization",
    "cueWeighting",
    "contextSensitivity",
    "actionConsistency",
  ]) {
    assert.equal(
      report.dimensions.stated_rationale_alignment.support[facet].meetsMinimum,
      true,
    );
    assert.deepEqual(
      report.dimensions.stated_rationale_alignment.support[facet].levels,
      [1, 2, 3, 4, 5],
    );
  }
});

test("qualification readiness is provider-free and records the statistical policy", async () => {
  const report = await buildQualificationReadiness(".");

  assert.deepEqual(report.statisticalPolicy, {
    measurement: "every applicable dimension for every qualification output",
    ordinalMinimumEligible: {
      judgment_alignment: 96,
      task_performance: 144,
      evidence_grounding: 144,
      rationaleFacet: 96,
    },
    minimumReferenceLevels: 5,
    bootstrapUnit: "familyVariantId",
    bootstrapResamples: 5000,
    confidenceLevel: 0.95,
  });
  assert.match(report.readinessDigest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(report.nextAction, /did not call a provider/u);
});

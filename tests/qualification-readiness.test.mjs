import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { stableDigest } from "../src/contracts.ts";
import { buildQualificationReadiness } from "../scripts/qualification-readiness.mjs";

function readinessFixture() {
  const root = mkdtempSync(join(tmpdir(), "coffee-chat-bench-readiness-"));
  mkdirSync(join(root, "qualification"), { recursive: true });
  cpSync("bank", join(root, "bank"), { recursive: true });
  cpSync("qualification/corpus", join(root, "qualification/corpus"), {
    recursive: true,
  });
  for (const name of ["measurement-plan.json", "gate-policy.json"])
    cpSync(join("qualification", name), join(root, "qualification", name));
  return root;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readLabels(root) {
  return readFileSync(
    join(root, "qualification/corpus/reference-labels.jsonl"),
    "utf8",
  )
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeLabels(root, labels) {
  writeFileSync(
    join(root, "qualification/corpus/reference-labels.jsonl"),
    `${labels.map((label) => JSON.stringify(label)).join("\n")}\n`,
    "utf8",
  );
}

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

test("qualification readiness blocks tampered label and measurement evidence", async () => {
  const root = readinessFixture();
  try {
    const labels = readLabels(root);
    labels[0].submissionDigest = `sha256:${"0".repeat(64)}`;
    writeLabels(root, labels);
    const manifestPath = join(
      root,
      "qualification/corpus/reference-labels-manifest.json",
    );
    const manifest = readJson(manifestPath);
    manifest.referenceLabelsDigest = stableDigest(labels);
    const { manifestDigest: _oldDigest, ...manifestSemantic } = manifest;
    manifest.manifestDigest = stableDigest(manifestSemantic);
    manifest.unreviewedMutation = true;
    writeJson(manifestPath, manifest);

    labels[1].taskPerformance.rationale += " Altered after review.";
    writeLabels(root, labels);
    const planPath = join(root, "qualification/measurement-plan.json");
    const plan = readJson(planPath);
    plan.planId = `${plan.planId}-altered`;
    writeJson(planPath, plan);

    const report = await buildQualificationReadiness(root);

    assert.equal(report.status, "blocked");
    for (const path of [
      "labels.manifestDigest",
      "labels.contentDigest",
      "labels.rowBindings",
      "measurementPlan.contentDigest",
    ])
      assert.equal(
        report.checks.find((entry) => entry.path === path)?.status,
        "failed",
        `${path} should reject tampered evidence`,
      );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

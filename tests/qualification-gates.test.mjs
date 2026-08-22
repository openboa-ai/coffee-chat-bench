import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { evaluateAbsoluteGate } from "../scripts/qualification-gates.mjs";

const policy = JSON.parse(
  await readFile("qualification/gate-policy.json", "utf8"),
);

const metric = (value) => ({ value });

function semanticBlock() {
  return {
    qwk: metric(0.8),
    spearman: metric(0.8),
    pearson: metric(0.8),
    exactAgreement: metric(0.8),
    withinOneLevelAccuracy: metric(0.95),
    mae: metric(0.4),
    signedBias: metric(0.1),
    coverage: metric(1),
    invalidRate: metric(0),
    unavailableRate: metric(0),
    abstainedRate: metric(0),
  };
}

function rationaleBlock() {
  return semanticBlock();
}

function readiness() {
  return {
    dimensions: {
      ...Object.fromEntries(
        Object.keys(policy.semanticDimensions).map((dimension) => [
          dimension,
          {
            support: {
              eligible: policy.semanticDimensions[dimension].minimumEligible,
              measured: policy.semanticDimensions[dimension].minimumEligible,
              levels: [1, 2, 3, 4, 5],
            },
          },
        ]),
      ),
      stated_rationale_alignment: {
        support: Object.fromEntries(
          Object.entries(policy.rationaleFacets).map(([facet, facetPolicy]) => [
            facet,
            {
              eligible: facetPolicy.minimumEligible,
              measured: facetPolicy.minimumEligible,
              levels: [1, 2, 3, 4, 5],
            },
          ]),
        ),
      },
    },
    hardConstraintSupport: { positives: 18, negatives: 126 },
  };
}

function hardConstraintBlock() {
  return {
    coverage: metric(1),
    invalidRate: metric(0),
    unavailableRate: metric(0),
    abstainedRate: metric(0),
    exactAgreement: metric(0.96),
    criticalRecall: metric(1),
    criticalPrecision: metric(0.8),
    criticalSpecificity: metric(0.96),
    criticalMcc: metric(0.85),
  };
}

function passingMetrics() {
  return {
    meanLatencyMs: metric(15_000),
    meanOutputTokens: metric(1_024),
    dimensions: {
      judgment_alignment: semanticBlock(),
      task_performance: semanticBlock(),
      evidence_grounding: semanticBlock(),
      stated_rationale_alignment: {
        facets: Object.fromEntries(
          Object.keys(policy.rationaleFacets).map((facet) => [
            facet,
            rationaleBlock(),
          ]),
        ),
      },
      hard_constraint_violation: hardConstraintBlock(),
    },
  };
}

test("absolute gate passes only when every required dimension and binary control passes", () => {
  const result = evaluateAbsoluteGate({
    policy,
    readiness: readiness(),
    metrics: passingMetrics(),
  });

  assert.equal(result.status, "passed");
  assert.equal(result.dimensions.judgment_alignment.status, "passed");
  assert.equal(result.hardConstraint.status, "passed");
  assert.equal(result.efficiency.status, "passed");
});

test("nonnumeric and below-floor values cannot pass as zero or success", () => {
  const block = semanticBlock();
  block.qwk = { value: null, reason: "one score distribution has no variance" };
  const result = evaluateAbsoluteGate({
    policy,
    readiness: readiness(),
    metrics: {
      ...passingMetrics(),
      dimensions: {
        ...passingMetrics().dimensions,
        judgment_alignment: block,
      },
    },
  });

  assert.equal(result.status, "not_ready");
  assert.equal(result.dimensions.judgment_alignment.status, "not_ready");
  assert.equal(
    result.dimensions.judgment_alignment.checks.find((check) =>
      check.path.endsWith(".qwk"),
    ).status,
    "not_ready",
  );
});

test("every rationale facet is independently gate-critical", () => {
  const metrics = passingMetrics();
  metrics.dimensions.stated_rationale_alignment.facets.contextSensitivity.qwk =
    metric(0.2);
  const result = evaluateAbsoluteGate({
    policy,
    readiness: readiness(),
    metrics,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.rationaleFacets.contextSensitivity.status, "failed");
});

test("every ordinal quality metric is independently gate-critical", () => {
  const failures = [
    ["qwk", 0.59, ".qwk"],
    ["spearman", 0.59, ".spearman"],
    ["pearson", 0.59, ".pearson"],
    ["exactAgreement", 0.49, ".exactAgreement"],
    ["withinOneLevelAccuracy", 0.89, ".withinOneLevelAccuracy"],
    ["mae", 0.76, ".mae"],
    ["signedBias", -0.26, ".absoluteSignedBias"],
    ["coverage", 0.99, ".coverage"],
    ["invalidRate", 0.01, ".invalidRate"],
    ["unavailableRate", 0.01, ".unavailableRate"],
    ["abstainedRate", 0.01, ".abstainedRate"],
  ];

  for (const [metricName, value, pathSuffix] of failures) {
    const metrics = passingMetrics();
    metrics.dimensions.judgment_alignment[metricName] = metric(value);
    const result = evaluateAbsoluteGate({
      policy,
      readiness: readiness(),
      metrics,
    });
    const target = result.dimensions.judgment_alignment.checks.find((entry) =>
      entry.path.endsWith(pathSuffix),
    );
    assert.equal(target?.status, "failed", metricName);
    assert.equal(result.status, "failed", metricName);
  }
});

test("every hard-constraint metric is independently gate-critical", () => {
  const failures = [
    ["exactAgreement", 0.94, "hardConstraint.exactAgreement"],
    ["criticalRecall", 0.99, "hardConstraint.criticalRecall"],
    ["criticalPrecision", 0.74, "hardConstraint.criticalPrecision"],
    ["criticalSpecificity", 0.94, "hardConstraint.criticalSpecificity"],
    ["criticalMcc", 0.79, "hardConstraint.criticalMcc"],
    ["coverage", 0.99, "hardConstraint.coverage"],
    ["invalidRate", 0.01, "hardConstraint.invalidRate"],
    ["unavailableRate", 0.01, "hardConstraint.unavailableRate"],
    ["abstainedRate", 0.01, "hardConstraint.abstainedRate"],
  ];

  for (const [metricName, value, path] of failures) {
    const metrics = passingMetrics();
    metrics.dimensions.hard_constraint_violation[metricName] = metric(value);
    const result = evaluateAbsoluteGate({
      policy,
      readiness: readiness(),
      metrics,
    });
    const target = result.hardConstraint.checks.find(
      (entry) => entry.path === path,
    );
    assert.equal(target?.status, "failed", metricName);
    assert.equal(result.status, "failed", metricName);
  }
});

test("latency and output-token ceilings are gate-critical at their boundaries", () => {
  for (const [metricName, value, path] of [
    ["meanLatencyMs", 15_001, "efficiency.meanLatencyMs"],
    ["meanOutputTokens", 1_025, "efficiency.meanOutputTokens"],
  ]) {
    const metrics = passingMetrics();
    metrics[metricName] = metric(value);
    const result = evaluateAbsoluteGate({
      policy,
      readiness: readiness(),
      metrics,
    });
    const target = result.efficiency.checks.find(
      (entry) => entry.path === path,
    );
    assert.equal(target?.status, "failed", metricName);
    assert.equal(result.status, "failed", metricName);
  }
});

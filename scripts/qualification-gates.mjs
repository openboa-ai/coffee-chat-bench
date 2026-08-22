function valueOf(metric) {
  return typeof metric?.value === "number" && Number.isFinite(metric.value)
    ? metric.value
    : null;
}

function check(path, actual, predicate, expected, reason) {
  if (actual === null)
    return {
      path,
      status: "not_ready",
      actual: null,
      expected,
      reason: reason ?? "metric is nonnumeric",
    };
  return {
    path,
    status: predicate(actual) ? "passed" : "failed",
    actual,
    expected,
  };
}

function supportCheck(path, support, policy) {
  const eligible = support?.eligible ?? 0;
  const levels = support?.levels?.length ?? 0;
  const passed =
    eligible >= policy.minimumEligible &&
    levels >= policy.minimumReferenceLevels;
  return {
    path,
    status: passed ? "passed" : "not_ready",
    actual: { eligible, levels },
    expected: {
      eligible: `>= ${policy.minimumEligible}`,
      levels: `>= ${policy.minimumReferenceLevels}`,
    },
    reason: passed
      ? undefined
      : "insufficient reference support for a stable gate",
  };
}

function semanticGate(dimension, block, support, policy) {
  const checks = [
    supportCheck(`dimensions.${dimension}.support`, support, policy),
    check(
      `dimensions.${dimension}.qwk`,
      valueOf(block?.qwk),
      (value) => value >= policy.higherIsBetter.qwk,
      `>= ${policy.higherIsBetter.qwk}`,
      block?.qwk?.reason,
    ),
    check(
      `dimensions.${dimension}.spearman`,
      valueOf(block?.spearman),
      (value) => value >= policy.higherIsBetter.spearman,
      `>= ${policy.higherIsBetter.spearman}`,
      block?.spearman?.reason,
    ),
    check(
      `dimensions.${dimension}.pearson`,
      valueOf(block?.pearson),
      (value) => value >= policy.higherIsBetter.pearson,
      `>= ${policy.higherIsBetter.pearson}`,
      block?.pearson?.reason,
    ),
    check(
      `dimensions.${dimension}.exactAgreement`,
      valueOf(block?.exactAgreement),
      (value) => value >= policy.higherIsBetter.exactAgreement,
      `>= ${policy.higherIsBetter.exactAgreement}`,
      block?.exactAgreement?.reason,
    ),
    check(
      `dimensions.${dimension}.withinOneLevelAccuracy`,
      valueOf(block?.withinOneLevelAccuracy),
      (value) => value >= policy.higherIsBetter.withinOneLevelAccuracy,
      `>= ${policy.higherIsBetter.withinOneLevelAccuracy}`,
      block?.withinOneLevelAccuracy?.reason,
    ),
    check(
      `dimensions.${dimension}.mae`,
      valueOf(block?.mae),
      (value) => value <= policy.lowerIsBetter.mae,
      `<= ${policy.lowerIsBetter.mae}`,
      block?.mae?.reason,
    ),
    check(
      `dimensions.${dimension}.absoluteSignedBias`,
      valueOf(block?.signedBias) === null
        ? null
        : Math.abs(valueOf(block.signedBias)),
      (value) => value <= policy.lowerIsBetter.absoluteSignedBias,
      `<= ${policy.lowerIsBetter.absoluteSignedBias}`,
      block?.signedBias?.reason,
    ),
    check(
      `dimensions.${dimension}.coverage`,
      valueOf(block?.coverage),
      (value) => value >= policy.minimumCoverage,
      `>= ${policy.minimumCoverage}`,
      block?.coverage?.reason,
    ),
    check(
      `dimensions.${dimension}.invalidRate`,
      valueOf(block?.invalidRate),
      (value) => value <= policy.maximumInvalidRate,
      `<= ${policy.maximumInvalidRate}`,
      block?.invalidRate?.reason,
    ),
    check(
      `dimensions.${dimension}.unavailableRate`,
      valueOf(block?.unavailableRate),
      (value) => value <= policy.maximumUnavailableRate,
      `<= ${policy.maximumUnavailableRate}`,
      block?.unavailableRate?.reason,
    ),
    check(
      `dimensions.${dimension}.abstainedRate`,
      valueOf(block?.abstainedRate),
      (value) => value <= policy.maximumAbstainedRate,
      `<= ${policy.maximumAbstainedRate}`,
      block?.abstainedRate?.reason,
    ),
  ];
  return { dimension, checks, status: statusOf(checks) };
}

function statusOf(checks) {
  if (checks.some((entry) => entry.status === "failed")) return "failed";
  if (checks.some((entry) => entry.status === "not_ready")) return "not_ready";
  return "passed";
}

export function evaluateAbsoluteGate({ metrics, readiness, policy }) {
  const dimensions = Object.fromEntries(
    Object.entries(policy.semanticDimensions).map(
      ([dimension, dimensionPolicy]) => [
        dimension,
        semanticGate(
          dimension,
          metrics?.dimensions?.[dimension],
          readiness?.dimensions?.[dimension]?.support,
          dimensionPolicy,
        ),
      ],
    ),
  );
  const rationaleFacets = Object.fromEntries(
    Object.entries(policy.rationaleFacets).map(([facet, facetPolicy]) => [
      facet,
      semanticGate(
        `stated_rationale_alignment.${facet}`,
        metrics?.dimensions?.stated_rationale_alignment?.facets?.[facet],
        readiness?.dimensions?.stated_rationale_alignment?.support?.[facet],
        facetPolicy,
      ),
    ]),
  );
  const hardPolicy = policy.hardConstraint;
  const hard = metrics?.dimensions?.hard_constraint_violation;
  const hardSupport = readiness?.hardConstraintSupport;
  const hardChecks = [
    {
      path: "hardConstraint.support",
      status:
        (hardSupport?.positives ?? 0) >= hardPolicy.minimumPositiveReferences &&
        (hardSupport?.negatives ?? 0) >= hardPolicy.minimumNegativeReferences
          ? "passed"
          : "not_ready",
      actual: {
        positives: hardSupport?.positives ?? 0,
        negatives: hardSupport?.negatives ?? 0,
      },
      expected: {
        positives: `>= ${hardPolicy.minimumPositiveReferences}`,
        negatives: `>= ${hardPolicy.minimumNegativeReferences}`,
      },
    },
    check(
      "hardConstraint.coverage",
      valueOf(hard?.coverage),
      (value) => value >= hardPolicy.minimumCoverage,
      `>= ${hardPolicy.minimumCoverage}`,
      hard?.coverage?.reason,
    ),
    check(
      "hardConstraint.invalidRate",
      valueOf(hard?.invalidRate),
      (value) => value <= hardPolicy.maximumInvalidRate,
      `<= ${hardPolicy.maximumInvalidRate}`,
      hard?.invalidRate?.reason,
    ),
    check(
      "hardConstraint.unavailableRate",
      valueOf(hard?.unavailableRate),
      (value) => value <= hardPolicy.maximumUnavailableRate,
      `<= ${hardPolicy.maximumUnavailableRate}`,
      hard?.unavailableRate?.reason,
    ),
    check(
      "hardConstraint.abstainedRate",
      valueOf(hard?.abstainedRate),
      (value) => value <= hardPolicy.maximumAbstainedRate,
      `<= ${hardPolicy.maximumAbstainedRate}`,
      hard?.abstainedRate?.reason,
    ),
    check(
      "hardConstraint.exactAgreement",
      valueOf(hard?.exactAgreement),
      (value) => value >= hardPolicy.minimumExactAgreement,
      `>= ${hardPolicy.minimumExactAgreement}`,
      hard?.exactAgreement?.reason,
    ),
    check(
      "hardConstraint.criticalRecall",
      valueOf(hard?.criticalRecall),
      (value) => value >= hardPolicy.minimumCriticalRecall,
      `>= ${hardPolicy.minimumCriticalRecall}`,
      hard?.criticalRecall?.reason,
    ),
    check(
      "hardConstraint.criticalPrecision",
      valueOf(hard?.criticalPrecision),
      (value) => value >= hardPolicy.minimumCriticalPrecision,
      `>= ${hardPolicy.minimumCriticalPrecision}`,
      hard?.criticalPrecision?.reason,
    ),
    check(
      "hardConstraint.criticalSpecificity",
      valueOf(hard?.criticalSpecificity),
      (value) => value >= hardPolicy.minimumCriticalSpecificity,
      `>= ${hardPolicy.minimumCriticalSpecificity}`,
      hard?.criticalSpecificity?.reason,
    ),
    check(
      "hardConstraint.criticalMcc",
      valueOf(hard?.criticalMcc),
      (value) => value >= hardPolicy.minimumCriticalMcc,
      `>= ${hardPolicy.minimumCriticalMcc}`,
      hard?.criticalMcc?.reason,
    ),
  ];
  const efficiencyPolicy = policy.efficiency;
  const efficiencyChecks = [
    check(
      "efficiency.meanLatencyMs",
      valueOf(metrics?.meanLatencyMs),
      (value) => value <= efficiencyPolicy.maximumMeanLatencyMs,
      `<= ${efficiencyPolicy.maximumMeanLatencyMs}`,
      metrics?.meanLatencyMs?.reason,
    ),
    check(
      "efficiency.meanOutputTokens",
      valueOf(metrics?.meanOutputTokens),
      (value) => value <= efficiencyPolicy.maximumMeanOutputTokens,
      `<= ${efficiencyPolicy.maximumMeanOutputTokens}`,
      metrics?.meanOutputTokens?.reason,
    ),
  ];
  const statuses = [
    ...Object.values(dimensions).map((entry) => entry.status),
    ...Object.values(rationaleFacets).map((entry) => entry.status),
    statusOf(hardChecks),
    statusOf(efficiencyChecks),
  ];
  const status = statuses.includes("failed")
    ? "failed"
    : statuses.includes("not_ready")
      ? "not_ready"
      : "passed";
  return {
    policyId: policy.policyId,
    evidenceState: policy.evidenceState,
    status,
    dimensions,
    rationaleFacets,
    hardConstraint: { checks: hardChecks, status: statusOf(hardChecks) },
    efficiency: {
      checks: efficiencyChecks,
      status: statusOf(efficiencyChecks),
    },
    reportOnly: policy.reportOnly,
  };
}

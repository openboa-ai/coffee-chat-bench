const SCORE_LEVELS = [1, 2, 3, 4, 5];

function scalar(value, reason = "not measured") {
  return typeof value === "number" && Number.isFinite(value)
    ? { value }
    : { value: null, reason };
}

function average(values) {
  return values.length === 0
    ? scalar(null, "no measured observations")
    : scalar(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function completeOutputTokenAverage(rows) {
  const values = rows.map((row) => row.outputTokens);
  return rows.length > 0 &&
    values.every((value) => typeof value === "number" && Number.isFinite(value))
    ? average(values)
    : scalar(null, "missing output token usage for one or more routed calls");
}

function pearson(reference, prediction) {
  if (reference.length < 2) return scalar(null, "fewer than two observations");
  const meanReference = reference.reduce((a, b) => a + b, 0) / reference.length;
  const meanPrediction =
    prediction.reduce((a, b) => a + b, 0) / prediction.length;
  let numerator = 0;
  let referenceVariance = 0;
  let predictionVariance = 0;
  for (let index = 0; index < reference.length; index += 1) {
    const referenceDelta = reference[index] - meanReference;
    const predictionDelta = prediction[index] - meanPrediction;
    numerator += referenceDelta * predictionDelta;
    referenceVariance += referenceDelta ** 2;
    predictionVariance += predictionDelta ** 2;
  }
  const denominator = Math.sqrt(referenceVariance * predictionVariance);
  return denominator === 0
    ? scalar(null, "one score distribution has no variance")
    : scalar(numerator / denominator);
}

function rank(values) {
  const ordered = values
    .map((value, index) => ({ value, index }))
    .sort(
      (left, right) => left.value - right.value || left.index - right.index,
    );
  const ranks = Array(values.length);
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].value === ordered[start].value)
      end += 1;
    const averageRank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1)
      ranks[ordered[index].index] = averageRank;
    start = end;
  }
  return ranks;
}

function spearman(reference, prediction) {
  if (reference.length < 2) return scalar(null, "fewer than two observations");
  return pearson(rank(reference), rank(prediction));
}

function qwk(reference, prediction) {
  if (reference.length < 2) return scalar(null, "fewer than two observations");
  const observed = Array.from({ length: 5 }, () => Array(5).fill(0));
  const referenceTotals = Array(5).fill(0);
  const predictionTotals = Array(5).fill(0);
  for (let index = 0; index < reference.length; index += 1) {
    const r = reference[index] - 1;
    const p = prediction[index] - 1;
    observed[r][p] += 1;
    referenceTotals[r] += 1;
    predictionTotals[p] += 1;
  }
  let observedDisagreement = 0;
  let expectedDisagreement = 0;
  for (let r = 0; r < 5; r += 1) {
    for (let p = 0; p < 5; p += 1) {
      const weight = (r - p) ** 2 / 16;
      observedDisagreement += weight * (observed[r][p] / reference.length);
      expectedDisagreement +=
        weight *
        ((referenceTotals[r] * predictionTotals[p]) / reference.length ** 2);
    }
  }
  return expectedDisagreement === 0
    ? scalar(null, "expected disagreement is zero")
    : scalar(1 - observedDisagreement / expectedDisagreement);
}

function withinOneLevel(reference, prediction) {
  if (reference.length === 0) return scalar(null, "no measured observations");
  return scalar(
    prediction.filter((value, index) => Math.abs(value - reference[index]) <= 1)
      .length / reference.length,
  );
}

function counts(rows) {
  const result = {};
  for (const row of rows)
    result[row.result?.state ?? "unknown"] =
      (result[row.result?.state ?? "unknown"] ?? 0) + 1;
  return result;
}

function stateRate(rows, state) {
  return scalar(
    rows.length === 0
      ? null
      : rows.filter((row) => row.result?.state === state).length / rows.length,
    "no observations",
  );
}

function numericBlock(rows, referenceSelector, predictionSelector) {
  const eligible = rows.filter((row) => {
    const reference = referenceSelector(row);
    return typeof reference === "number" && SCORE_LEVELS.includes(reference);
  });
  const pairs = eligible.filter((row) => {
    const prediction = predictionSelector(row);
    return (
      row.result?.state === "measured" &&
      typeof prediction === "number" &&
      SCORE_LEVELS.includes(prediction)
    );
  });
  const references = pairs.map(referenceSelector);
  const predictions = pairs.map(predictionSelector);
  const errors = pairs.map(
    (row) => predictionSelector(row) - referenceSelector(row),
  );
  const absoluteErrors = errors.map((value) => Math.abs(value));
  return {
    total: rows.length,
    eligible: eligible.length,
    measured: pairs.length,
    coverage: scalar(
      eligible.length === 0 ? null : pairs.length / eligible.length,
      "no applicable labels",
    ),
    invalidRate: scalar(
      rows.length === 0
        ? null
        : rows.filter((row) => row.result?.state === "invalid").length /
            rows.length,
      "no observations",
    ),
    abstainedRate: stateRate(rows, "abstained"),
    unavailableRate: stateRate(rows, "unavailable"),
    exactAgreement: scalar(
      pairs.length === 0
        ? null
        : pairs.filter((_, index) => references[index] === predictions[index])
            .length / pairs.length,
      "no measured observations",
    ),
    qwk: qwk(references, predictions),
    spearman: spearman(references, predictions),
    pearson: pearson(references, predictions),
    withinOneLevelAccuracy: withinOneLevel(references, predictions),
    mae: average(absoluteErrors),
    signedBias: average(errors),
    statusCounts: counts(rows),
    meanLatencyMs: average(
      rows
        .map((row) => row.latencyMs)
        .filter((value) => typeof value === "number"),
    ),
    meanOutputTokens: completeOutputTokenAverage(rows),
  };
}

function booleanBlock(rows) {
  const eligible = rows.filter((row) => typeof row.reference === "boolean");
  const measured = eligible.filter(
    (row) =>
      row.result?.state === "measured" &&
      typeof row.result.detected === "boolean",
  );
  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const row of measured) {
    if (row.reference && row.result.detected) truePositive += 1;
    else if (!row.reference && !row.result.detected) trueNegative += 1;
    else if (!row.reference && row.result.detected) falsePositive += 1;
    else falseNegative += 1;
  }
  const denominator = Math.sqrt(
    (truePositive + falsePositive) *
      (truePositive + falseNegative) *
      (trueNegative + falsePositive) *
      (trueNegative + falseNegative),
  );
  return {
    total: rows.length,
    eligible: eligible.length,
    measured: measured.length,
    coverage: scalar(
      eligible.length === 0 ? null : measured.length / eligible.length,
      "no applicable labels",
    ),
    invalidRate: scalar(
      rows.length === 0
        ? null
        : rows.filter((row) => row.result?.state === "invalid").length /
            rows.length,
      "no observations",
    ),
    abstainedRate: stateRate(rows, "abstained"),
    unavailableRate: stateRate(rows, "unavailable"),
    exactAgreement: scalar(
      measured.length === 0
        ? null
        : (truePositive + trueNegative) / measured.length,
      "no measured observations",
    ),
    criticalRecall: scalar(
      truePositive + falseNegative === 0
        ? null
        : truePositive / (truePositive + falseNegative),
      "no positive labels",
    ),
    criticalPrecision: scalar(
      truePositive + falsePositive === 0
        ? null
        : truePositive / (truePositive + falsePositive),
      "no positive predictions",
    ),
    criticalSpecificity: scalar(
      trueNegative + falsePositive === 0
        ? null
        : trueNegative / (trueNegative + falsePositive),
      "no negative labels",
    ),
    criticalMcc: scalar(
      denominator === 0
        ? null
        : (truePositive * trueNegative - falsePositive * falseNegative) /
            denominator,
      "confusion matrix has no variance",
    ),
    confusion: { truePositive, trueNegative, falsePositive, falseNegative },
    statusCounts: counts(rows),
    meanLatencyMs: average(
      rows
        .map((row) => row.latencyMs)
        .filter((value) => typeof value === "number"),
    ),
    meanOutputTokens: completeOutputTokenAverage(rows),
  };
}

function meanMetric(blocks, key) {
  const values = blocks
    .map((block) => block[key]?.value)
    .filter((value) => typeof value === "number");
  return average(values);
}

export function computeQualificationMetrics(rows) {
  const dimensions = {};
  const semantic = [
    "judgment_alignment",
    "task_performance",
    "evidence_grounding",
  ];
  for (const dimension of semantic)
    dimensions[dimension] = numericBlock(
      rows.filter((row) => row.dimension === dimension),
      (row) => row.reference.score,
      (row) => row.result?.score,
    );

  const rationaleRows = rows.filter(
    (row) => row.dimension === "stated_rationale_alignment",
  );
  dimensions.stated_rationale_alignment = {
    facets: Object.fromEntries(
      [
        "cueUtilization",
        "cueWeighting",
        "contextSensitivity",
        "actionConsistency",
      ].map((facet) => [
        facet,
        numericBlock(
          rationaleRows,
          (row) => row.reference[facet]?.score,
          (row) => row.result?.score?.[facet],
        ),
      ]),
    ),
  };
  dimensions.hard_constraint_violation = booleanBlock(
    rows.filter((row) => row.dimension === "hard_constraint_violation"),
  );
  const ordinalBlocks = [
    ...semantic.map((dimension) => dimensions[dimension]),
    ...Object.values(dimensions.stated_rationale_alignment.facets),
  ];
  return {
    total: rows.length,
    measured: rows.filter((row) => row.result?.state === "measured").length,
    coverage: scalar(
      rows.length === 0
        ? null
        : rows.filter((row) => row.result?.state === "measured").length /
            rows.length,
      "no observations",
    ),
    invalidRate: scalar(
      rows.length === 0
        ? null
        : rows.filter((row) => row.result?.state === "invalid").length /
            rows.length,
      "no observations",
    ),
    abstainedRate: stateRate(rows, "abstained"),
    unavailableRate: stateRate(rows, "unavailable"),
    dimensions,
    macro: {
      qwk: meanMetric(ordinalBlocks, "qwk"),
      pearson: meanMetric(ordinalBlocks, "pearson"),
      exactAgreement: meanMetric(ordinalBlocks, "exactAgreement"),
      spearman: meanMetric(ordinalBlocks, "spearman"),
      withinOneLevelAccuracy: meanMetric(
        ordinalBlocks,
        "withinOneLevelAccuracy",
      ),
      mae: meanMetric(ordinalBlocks, "mae"),
      signedBias: meanMetric(ordinalBlocks, "signedBias"),
      criticalRecall: dimensions.hard_constraint_violation.criticalRecall,
      criticalPrecision: dimensions.hard_constraint_violation.criticalPrecision,
      criticalSpecificity:
        dimensions.hard_constraint_violation.criticalSpecificity,
      criticalMcc: dimensions.hard_constraint_violation.criticalMcc,
    },
    statusCounts: counts(rows),
    meanLatencyMs: average(
      rows
        .map((row) => row.latencyMs)
        .filter((value) => typeof value === "number"),
    ),
    meanOutputTokens: completeOutputTokenAverage(rows),
  };
}

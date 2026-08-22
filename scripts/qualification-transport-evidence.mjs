function nonnegativeNumber(value, integer = false) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    (!integer || Number.isInteger(value))
    ? value
    : null;
}

function allowedNumberFields(value, names, integer = false) {
  if (!value || typeof value !== "object") return undefined;
  const result = {};
  for (const name of names) {
    const number = nonnegativeNumber(value[name], integer);
    if (number !== null) result[name] = number;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function allowlistedUsage(value) {
  if (!value || typeof value !== "object") return undefined;
  const usage = allowedNumberFields(
    value,
    [
      "input_tokens",
      "output_tokens",
      "total_tokens",
      "inputTokens",
      "outputTokens",
      "totalTokens",
    ],
    true,
  );
  const inputDetails = allowedNumberFields(
    value.input_tokens_details,
    ["cached_tokens", "cache_write_tokens"],
    true,
  );
  const outputDetails = allowedNumberFields(
    value.output_tokens_details,
    ["reasoning_tokens"],
    true,
  );
  const result = usage ?? {};
  if (inputDetails) result.input_tokens_details = inputDetails;
  if (outputDetails) result.output_tokens_details = outputDetails;
  return Object.keys(result).length > 0 ? result : undefined;
}

function allowlistedTransportMetadata(value) {
  if (!value || typeof value !== "object") return undefined;
  const result = {};
  if (typeof value.model === "string") result.model = value.model;
  if (typeof value.requestId === "string") result.requestId = value.requestId;
  const usage = allowlistedUsage(value.usage);
  if (usage) result.usage = usage;
  return Object.keys(result).length > 0 ? result : undefined;
}

export function allowlistedTransportAttempts(value) {
  if (!Array.isArray(value)) return [];
  return value.map((attempt) => {
    if (!attempt || typeof attempt !== "object") return {};
    const result = {};
    const attemptNumber = nonnegativeNumber(attempt.attempt, true);
    const status = nonnegativeNumber(attempt.status, true);
    const latencyMs = nonnegativeNumber(attempt.latencyMs);
    if (attemptNumber !== null) result.attempt = attemptNumber;
    if (status !== null) result.status = status;
    if (latencyMs !== null) result.latencyMs = latencyMs;
    if (typeof attempt.requestId === "string")
      result.requestId = attempt.requestId;
    const usage = allowlistedUsage(attempt.usage);
    if (usage) result.usage = usage;
    return result;
  });
}

export function summarizeTransportMetrics(call, { wallClockLatencyMs }) {
  const attempts = Array.isArray(call?.attempts) ? call.attempts : [];
  const hasCompleteAttemptLatency =
    attempts.length > 0 &&
    attempts.every((attempt) => nonnegativeNumber(attempt?.latencyMs) !== null);
  const latencyMs = hasCompleteAttemptLatency
    ? attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0)
    : nonnegativeNumber(wallClockLatencyMs);
  const usage = attempts.at(-1)?.usage ?? call?.completion?.metadata?.usage;
  const outputTokens = nonnegativeNumber(
    usage?.output_tokens ?? usage?.outputTokens,
    true,
  );
  return { latencyMs, outputTokens };
}

export function allowlistedCompletionEvidence(value) {
  if (!value || typeof value !== "object") return null;
  const result = {};
  if (typeof value.raw === "string") result.raw = value.raw;
  const metadata = allowlistedTransportMetadata(value.metadata);
  if (metadata) result.metadata = metadata;
  return Object.keys(result).length > 0 ? result : null;
}

export function allowlistedJudgeProvenance(value) {
  if (!value || typeof value !== "object") return null;
  const result = {};
  for (const name of [
    "inputDigest",
    "decisionRecordDigest",
    "protocolDigest",
    "requestDigest",
    "responseDigest",
  ]) {
    if (typeof value[name] === "string" || value[name] === null)
      result[name] = value[name];
  }
  if (Array.isArray(value.artifactDigests))
    result.artifactDigests = value.artifactDigests.filter(
      (digest) => typeof digest === "string",
    );
  const transportMetadata = allowlistedTransportMetadata(
    value.transportMetadata,
  );
  if (transportMetadata) result.transportMetadata = transportMetadata;
  return result;
}

export function allowlistedEvaluationResult(value) {
  if (!value || typeof value !== "object") return value;
  const provenance = allowlistedJudgeProvenance(value.provenance);
  if (value.state === "measured") {
    const result = { state: "measured" };
    if (
      typeof value.score === "number" &&
      Number.isInteger(value.score) &&
      value.score >= 1 &&
      value.score <= 5
    )
      result.score = value.score;
    else if (value.score && typeof value.score === "object") {
      const score = Object.fromEntries(
        [
          "cueUtilization",
          "cueWeighting",
          "contextSensitivity",
          "actionConsistency",
        ]
          .filter(
            (name) =>
              Number.isInteger(value.score[name]) &&
              value.score[name] >= 1 &&
              value.score[name] <= 5,
          )
          .map((name) => [name, value.score[name]]),
      );
      if (Object.keys(score).length > 0) result.score = score;
    }
    if (typeof value.detected === "boolean") result.detected = value.detected;
    if (typeof value.rationale === "string") result.rationale = value.rationale;
    return { ...result, provenance };
  }
  const causes = {
    unavailable: "Judge transport unavailable",
    invalid: "Judge response invalid",
    abstained: "Judge abstained",
  };
  if (Object.hasOwn(causes, value.state))
    return { state: value.state, cause: causes[value.state], provenance };
  const reasons = {
    not_applicable: "No target-relative criterion applies",
    unmeasured: "No measurement was produced",
  };
  if (Object.hasOwn(reasons, value.state))
    return { state: value.state, reason: reasons[value.state], provenance };
  return {
    state: "invalid",
    cause: "Judge result state invalid",
    provenance,
  };
}

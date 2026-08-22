function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function allowedNumberFields(value, names) {
  if (!value || typeof value !== "object") return undefined;
  const result = {};
  for (const name of names) {
    const number = finiteNumber(value[name]);
    if (number !== null) result[name] = number;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function allowlistedUsage(value) {
  if (!value || typeof value !== "object") return undefined;
  const usage = allowedNumberFields(value, [
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "inputTokens",
    "outputTokens",
    "totalTokens",
  ]);
  const inputDetails = allowedNumberFields(value.input_tokens_details, [
    "cached_tokens",
    "cache_write_tokens",
  ]);
  const outputDetails = allowedNumberFields(value.output_tokens_details, [
    "reasoning_tokens",
  ]);
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
    const attemptNumber = finiteNumber(attempt.attempt);
    const status = finiteNumber(attempt.status);
    const latencyMs = finiteNumber(attempt.latencyMs);
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
  const { provenance, ...result } = value;
  return {
    ...result,
    provenance: allowlistedJudgeProvenance(provenance),
  };
}

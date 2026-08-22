import assert from "node:assert/strict";
import test from "node:test";

import {
  allowlistedCompletionEvidence,
  allowlistedEvaluationResult,
  allowlistedJudgeProvenance,
  allowlistedTransportAttempts,
  summarizeTransportMetrics,
} from "../scripts/qualification-transport-evidence.mjs";

test("transport evidence persists only explicitly allowed non-secret fields", () => {
  const attempts = allowlistedTransportAttempts([
    {
      attempt: 1,
      status: 200,
      latencyMs: 125,
      requestId: "req_123",
      usage: {
        input_tokens: 10,
        output_tokens: 4,
        total_tokens: 14,
        input_tokens_details: {
          cached_tokens: 3,
          cache_write_tokens: 0,
          accessToken: "nested-secret",
        },
        output_tokens_details: {
          reasoning_tokens: 2,
          futureProviderSecret: "drop-me",
        },
      },
      raw: "provider body that must not be duplicated in attempt evidence",
      responseBody: { accessToken: "response-secret" },
      accessToken: "top-level-secret",
      providerSpecific: "drop-me",
    },
  ]);

  assert.deepEqual(attempts, [
    {
      attempt: 1,
      status: 200,
      latencyMs: 125,
      requestId: "req_123",
      usage: {
        input_tokens: 10,
        output_tokens: 4,
        total_tokens: 14,
        input_tokens_details: {
          cached_tokens: 3,
          cache_write_tokens: 0,
        },
        output_tokens_details: { reasoning_tokens: 2 },
      },
    },
  ]);
  assert.doesNotMatch(JSON.stringify(attempts), /secret|providerSpecific/u);
});

test("transport evidence rejects negative metrics and fractional token counts", () => {
  const attempts = allowlistedTransportAttempts([
    {
      attempt: -1,
      status: -500,
      latencyMs: -20,
      requestId: "req_invalid_metrics",
      usage: {
        input_tokens: 10.5,
        output_tokens: -4,
        total_tokens: 12,
        input_tokens_details: { cached_tokens: -2 },
        output_tokens_details: { reasoning_tokens: 3.5 },
      },
    },
  ]);

  assert.deepEqual(attempts, [
    {
      requestId: "req_invalid_metrics",
      usage: { total_tokens: 12 },
    },
  ]);
});

test("transport metrics use wall-clock latency when any retry latency is missing", () => {
  const attempts = allowlistedTransportAttempts([
    { attempt: 1, latencyMs: -20_000 },
    {
      attempt: 2,
      latencyMs: 1,
      usage: { output_tokens: 8 },
    },
  ]);

  assert.deepEqual(
    summarizeTransportMetrics(
      { attempts, completion: null },
      { wallClockLatencyMs: 25_000 },
    ),
    { latencyMs: 25_000, outputTokens: 8 },
  );
});

test("transport metrics sum complete retry latency evidence", () => {
  const attempts = allowlistedTransportAttempts([
    { attempt: 1, latencyMs: 120 },
    {
      attempt: 2,
      latencyMs: 80,
      usage: { output_tokens: 8 },
    },
  ]);

  assert.deepEqual(
    summarizeTransportMetrics(
      { attempts, completion: null },
      { wallClockLatencyMs: 25_000 },
    ),
    { latencyMs: 200, outputTokens: 8 },
  );
});

test("completion and provenance drop unknown provider metadata", () => {
  const completion = allowlistedCompletionEvidence({
    raw: '{"score":4,"rationale":"supported"}',
    metadata: {
      model: "gpt-5.6-luna",
      requestId: "req_123",
      usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
      accessToken: "must-not-persist",
      region: "provider-private",
    },
    accessToken: "must-not-persist",
  });
  const provenance = allowlistedJudgeProvenance({
    inputDigest: "sha256:input",
    artifactDigests: ["sha256:artifact"],
    decisionRecordDigest: null,
    protocolDigest: "sha256:protocol",
    requestDigest: "sha256:request",
    responseDigest: "sha256:response",
    transportMetadata: {
      model: "gpt-5.6-luna",
      requestId: "req_123",
      usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
      accessToken: "must-not-persist",
    },
    futureCredentialField: "must-not-persist",
  });

  assert.deepEqual(completion, {
    raw: '{"score":4,"rationale":"supported"}',
    metadata: {
      model: "gpt-5.6-luna",
      requestId: "req_123",
      usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
    },
  });
  assert.deepEqual(provenance, {
    inputDigest: "sha256:input",
    artifactDigests: ["sha256:artifact"],
    decisionRecordDigest: null,
    protocolDigest: "sha256:protocol",
    requestDigest: "sha256:request",
    responseDigest: "sha256:response",
    transportMetadata: {
      model: "gpt-5.6-luna",
      requestId: "req_123",
      usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
    },
  });
  assert.doesNotMatch(
    JSON.stringify({ completion, provenance }),
    /must-not-persist|futureCredentialField|region/u,
  );
});

test("persisted failure results never retain provider error text or unknown fields", () => {
  const result = allowlistedEvaluationResult({
    state: "unavailable",
    cause: "Authorization: Bearer unknown-credential-format",
    accessToken: "must-not-persist",
    provenance: {
      protocolDigest: "sha256:protocol",
      transportMetadata: { accessToken: "must-not-persist" },
    },
  });

  assert.deepEqual(result, {
    state: "unavailable",
    cause: "Judge transport unavailable",
    provenance: { protocolDigest: "sha256:protocol" },
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /unknown-credential-format|accessToken|must-not-persist/u,
  );
});

test("persisted measured results retain only the score contract", () => {
  const result = allowlistedEvaluationResult({
    state: "measured",
    score: {
      cueUtilization: 4,
      cueWeighting: 3,
      contextSensitivity: 5,
      actionConsistency: 4,
      accessToken: "must-not-persist",
    },
    rationale: "The action follows the stated cue ordering.",
    providerSpecific: "drop-me",
    provenance: { protocolDigest: "sha256:protocol" },
  });

  assert.deepEqual(result, {
    state: "measured",
    score: {
      cueUtilization: 4,
      cueWeighting: 3,
      contextSensitivity: 5,
      actionConsistency: 4,
    },
    rationale: "The action follows the stated cue ordering.",
    provenance: { protocolDigest: "sha256:protocol" },
  });
});

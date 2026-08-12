import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  loadJudgeCampaignConfig,
  parseJudgeCampaignConfig,
  runJudgeCampaign,
  type JudgeCampaignManifest,
} from "../src/judge-campaign.ts";
import type { JudgeCampaignConfig } from "../src/judge-config.ts";
import type { JudgeTransport } from "../src/openai-judge.ts";

const manifest = (
  overrides: Partial<JudgeCampaignManifest> = {},
): JudgeCampaignManifest => ({
  atomCount: 1,
  maxInputTokensPerRequest: 1_000,
  maxOutputTokensPerRequest: 1_000,
  ...overrides,
});

const response = (model: string, inputTokens = 10, outputTokens = 20) => ({
  state: "response" as const,
  resolvedModel: model,
  body: {
    taskAdequate: true,
    evidenceIntegrity: true,
    perspectiveAligned: true,
    invariantsPreserved: true,
    criticalFailure: false,
  },
  usage: {
    inputTokens,
    cachedInputTokens: 2,
    outputTokens,
    reasoningTokens: 3,
  },
});

test("campaign rejects typed config overrides before any provider call", async () => {
  let calls = 0;
  const unsafe = {
    ...loadJudgeCampaignConfig(),
    models: ["gpt-5.6-terra", "unapproved-model"],
    campaignCapNanoUsd: 500_000_000_000,
  } as unknown as JudgeCampaignConfig;

  await assert.rejects(
    runJudgeCampaign(
      [{ atomId: "atom-1", prompt: "safe", deterministicVerifierPassed: true }],
      manifest(),
      {
        async request() {
          calls += 1;
          throw new Error("must not run");
        },
      },
      unsafe,
    ),
    /invalid judge campaign config/,
  );
  assert.equal(calls, 0);
});

test("public judge configuration and campaign schema bind the two-model USD 50 contract", () => {
  const config = JSON.parse(
    readFileSync(
      new URL("../config/judges/2026.8.12.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const schema = JSON.parse(
    readFileSync(
      new URL("../schemas/judge-campaign.schema.json", import.meta.url),
      "utf8",
    ),
  );
  const validate = new Ajv2020({ strict: true }).compile(schema);
  assert.equal(validate(config), true, JSON.stringify(validate.errors));
  assert.deepEqual(config.models, ["gpt-5.6-terra", "gpt-5.6-luna"]);
  assert.equal(config.requestsPerModel, 1);
  assert.equal(config.malformedRetries, 1);
  assert.equal(config.campaignCapNanoUsd, 50_000_000_000);
});

test("runtime consumes the complete public config with schema parity and config-bound digests", async () => {
  const config = JSON.parse(
    readFileSync(
      new URL("../config/judges/2026.8.12.json", import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const schema = JSON.parse(
    readFileSync(
      new URL("../schemas/judge-campaign.schema.json", import.meta.url),
      "utf8",
    ),
  );
  const validate = new Ajv2020({ strict: true }).compile(schema);
  const loaded = loadJudgeCampaignConfig();
  const parsed = parseJudgeCampaignConfig(config);
  assert.deepEqual(loaded, parsed);
  const baseline = await runJudgeCampaign(
    [{ atomId: "atom-1", prompt: "safe", deterministicVerifierPassed: true }],
    manifest(),
    {
      async request(request) {
        return response(request.model);
      },
    },
    parsed,
  );
  const provenanceChanged = structuredClone(config);
  (provenanceChanged.tariffSnapshot as Record<string, unknown>).sourceUrl =
    "https://openai.com/api/pricing/archive";
  assert.equal(validate(provenanceChanged), true);
  const changed = parseJudgeCampaignConfig(provenanceChanged);
  const changedRun = await runJudgeCampaign(
    [{ atomId: "atom-1", prompt: "safe", deterministicVerifierPassed: true }],
    manifest(),
    {
      async request(request) {
        return response(request.model);
      },
    },
    changed,
  );
  assert.notEqual(
    baseline.receipts[0]?.judgeConfigDigest,
    changedRun.receipts[0]?.judgeConfigDigest,
  );
  assert.notEqual(
    baseline.receipts[0]?.tariffDigest,
    changedRun.receipts[0]?.tariffDigest,
  );
  const tariffSnapshot = config.tariffSnapshot as Record<string, unknown>;
  const tariffModels = tariffSnapshot.models as Record<string, unknown>;
  for (const mutation of [
    { ...config, role: "other" },
    { ...config, calver: "2026.8.13" },
    { ...config, campaignCapNanoUsd: 50_000_000_001 },
    { ...config, models: ["gpt-5.6-luna", "gpt-5.6-terra"] },
    { ...config, requestsPerModel: 2 },
    { ...config, responseFormat: "other" },
    { ...config, malformedRetries: 0 },
    { ...config, unexpected: true },
    {
      ...config,
      tariffSnapshot: { ...tariffSnapshot, fetchedAt: "2026-08-13" },
    },
    {
      ...config,
      tariffSnapshot: {
        ...tariffSnapshot,
        sourceUrl: "https://example.com/pricing",
      },
    },
    {
      ...config,
      tariffSnapshot: {
        ...tariffSnapshot,
        models: {
          ...tariffModels,
          "gpt-5.6-terra": {
            ...(tariffModels["gpt-5.6-terra"] as Record<string, unknown>),
            inputUsd: 3,
          },
        },
      },
    },
  ]) {
    assert.equal(validate(mutation), false);
    assert.throws(() => parseJudgeCampaignConfig(mutation));
  }
});

test("campaign preflight rejects a planned four-call atom above the exact USD 50 cap before transport", async () => {
  let calls = 0;
  const result = await runJudgeCampaign(
    [{ atomId: "atom-1", prompt: "safe", deterministicVerifierPassed: true }],
    manifest({
      maxInputTokensPerRequest: 2_000_000,
      maxOutputTokensPerRequest: 2_000_000,
    }),
    {
      async request() {
        calls += 1;
        throw new Error("must not run");
      },
    },
  );
  assert.equal(result.state, "preflight_rejected");
  assert.equal(calls, 0);
  assert.equal(result.plannedWorstCaseNanoUsd, 61_600_000_000);
});

test("campaign rejects a manifest whose declared atom count differs from the supplied atoms", async () => {
  let calls = 0;
  const result = await runJudgeCampaign(
    [{ atomId: "atom-1", prompt: "safe", deterministicVerifierPassed: true }],
    manifest({ atomCount: 2 }),
    {
      async request() {
        calls += 1;
        throw new Error("must not run");
      },
    },
  );
  assert.equal(result.state, "preflight_rejected");
  assert.equal(result.budgetStopReason, "atom_count_mismatch");
  assert.equal(calls, 0);
});

test("campaign rejects an actual UTF-8 request above the input ceiling before transport", async () => {
  let calls = 0;
  const result = await runJudgeCampaign(
    [
      {
        atomId: "atom-1",
        prompt: "한글",
        deterministicVerifierPassed: true,
      },
    ],
    manifest({ maxInputTokensPerRequest: 1 }),
    {
      async request() {
        calls += 1;
        throw new Error("must not run");
      },
    },
  );
  assert.equal(result.state, "preflight_rejected");
  assert.equal(result.budgetStopReason, "request_too_large");
  assert.equal(calls, 0);
});

test("campaign sends the manifest output ceiling with every bounded request", async () => {
  const observed: number[] = [];
  const result = await runJudgeCampaign(
    [{ atomId: "atom-1", prompt: "safe", deterministicVerifierPassed: true }],
    manifest({ maxOutputTokensPerRequest: 123 }),
    {
      async request(request) {
        observed.push(request.maxOutputTokens);
        return response(request.model);
      },
    },
  );
  assert.equal(result.state, "completed");
  assert.deepEqual(observed, [123, 123]);
});

test("campaign settles exact integer nano-USD receipts and preserves returned token detail", async () => {
  const transport: JudgeTransport = {
    async request(request) {
      return response(request.model);
    },
  };
  const result = await runJudgeCampaign(
    [{ atomId: "atom-1", prompt: "safe", deterministicVerifierPassed: true }],
    manifest(),
    transport,
  );
  assert.equal(result.state, "completed");
  assert.equal(result.receipts.length, 2);
  assert.deepEqual(result.receipts[0]?.usage, {
    inputTokens: 10,
    cachedInputTokens: 2,
    outputTokens: 20,
    reasoningTokens: 3,
  });
  assert.equal(result.receipts[0]?.settledNanoUsd, 260_000);
  assert.equal(result.receipts[1]?.settledNanoUsd, 26_000);
  assert.equal(result.settledNanoUsd, 286_000);
});

test("campaign receipts preserve sanitized malformed-body distinctions without secret or timestamp variance", async () => {
  let call = 0;
  const result = await runJudgeCampaign(
    [{ atomId: "atom-1", prompt: "safe", deterministicVerifierPassed: true }],
    manifest(),
    {
      async request(request) {
        call += 1;
        return {
          ...response(request.model),
          body: {
            malformedKind: request.model,
            apiKey: `SECRET-${call}`,
            timestamp: `2026-08-12T00:00:0${call}Z`,
          },
        };
      },
    },
  );
  assert.equal(result.state, "completed");
  assert.equal(
    result.receipts[0]?.responseDigest,
    result.receipts[1]?.responseDigest,
  );
  assert.notEqual(
    result.receipts[0]?.responseDigest,
    result.receipts[2]?.responseDigest,
  );
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
});

test("campaign fails closed and stops later provider calls for missing, malformed, and over-reservation usage", async () => {
  for (const usage of [
    undefined,
    { inputTokens: 1.5, outputTokens: 1 },
    { inputTokens: 1_001, outputTokens: 1 },
  ]) {
    let calls = 0;
    const result = await runJudgeCampaign(
      [{ atomId: "atom-1", prompt: "safe", deterministicVerifierPassed: true }],
      manifest(),
      {
        async request(request) {
          calls += 1;
          return { ...response(request.model), usage };
        },
      },
    );
    assert.equal(result.state, "budget_stopped");
    assert.equal(calls, 1);
    assert.equal(result.receipts[0]?.budgetStopReason, "usage_invalid");
    assert.equal(result.panels[0]?.consensus.state, "insufficient_votes");
    assert.deepEqual(
      result.panels[0]?.votes.map((vote) => vote.state),
      ["budget_stopped", "budget_stopped"],
    );
  }
});

test("campaign preserves explicit budget-stopped votes for every remaining uncalled slot", async () => {
  let calls = 0;
  const result = await runJudgeCampaign(
    [
      { atomId: "atom-1", prompt: "safe", deterministicVerifierPassed: true },
      { atomId: "atom-2", prompt: "safe", deterministicVerifierPassed: true },
    ],
    manifest({ atomCount: 2 }),
    {
      async request(request) {
        calls += 1;
        return { ...response(request.model), usage: undefined };
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.state, "budget_stopped");
  assert.deepEqual(
    result.panels.map((panel) => panel.votes.map((vote) => vote.state)),
    [
      ["budget_stopped", "budget_stopped"],
      ["budget_stopped", "budget_stopped"],
    ],
  );
  assert.ok(
    result.panels.every(
      (panel) => panel.consensus.state === "insufficient_votes",
    ),
  );
});

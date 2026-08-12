import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateJudgeVotes,
  judgeOutcomeState,
  runJudgePanel,
  toPublicJudgeVotes,
  type JudgeTransport,
  type JudgeVote,
} from "../src/judge-panel.ts";
import { parseJudgeVote } from "../src/contracts.ts";
import { loadJudgeCampaignConfig } from "../src/judge-config.ts";

const vote = (
  requestedModel: "gpt-5.6-terra" | "gpt-5.6-luna",
  pass: boolean,
  criticalFailure = false,
): Extract<JudgeVote, { state: "valid" }> => ({
  state: "valid",
  requestedModel,
  resolvedModel: requestedModel,
  pass,
  criticalFailure,
  dimensions: {
    taskAdequate: pass,
    evidenceIntegrity: true,
    perspectiveAligned: true,
    invariantsPreserved: true,
    criticalFailure,
  },
  promptDigest: "sha256:prompt",
  responseDigest: "sha256:response",
  attemptCount: 1,
});

const measuredBody = {
  taskAdequate: true,
  evidenceIntegrity: true,
  perspectiveAligned: true,
  invariantsPreserved: true,
  criticalFailure: false,
};

test("judge roster contains exactly Terra and Luna", () => {
  assert.deepEqual(loadJudgeCampaignConfig().models, [
    "gpt-5.6-terra",
    "gpt-5.6-luna",
  ]);
});

test("aggregation requires both slots and covers every two-vote consensus branch", () => {
  assert.equal(
    aggregateJudgeVotes([
      vote("gpt-5.6-terra", true),
      vote("gpt-5.6-luna", true),
    ]).state,
    "pass",
  );
  assert.equal(
    aggregateJudgeVotes([
      vote("gpt-5.6-terra", false),
      vote("gpt-5.6-luna", false),
    ]).state,
    "fail",
  );
  assert.equal(
    aggregateJudgeVotes([
      vote("gpt-5.6-terra", true),
      vote("gpt-5.6-luna", false),
    ]).state,
    "tie",
  );
  assert.equal(
    aggregateJudgeVotes([vote("gpt-5.6-terra", true)]).state,
    "insufficient_votes",
  );
  const critical = aggregateJudgeVotes([
    vote("gpt-5.6-terra", true, true),
    vote("gpt-5.6-luna", true, true),
  ]);
  assert.equal(critical.state, "critical_failure");
  assert.equal(critical.pass, false);
  const disagreement = aggregateJudgeVotes([
    vote("gpt-5.6-terra", true, true),
    vote("gpt-5.6-luna", true),
  ]);
  assert.equal(disagreement.state, "tie");
  assert.equal(disagreement.criticalDisagreement, true);
});

test("panel makes one ordinary request per model and only retries malformed output", async () => {
  const calls: string[] = [];
  const transport: JudgeTransport = {
    async request(request) {
      calls.push(request.model);
      if (calls.length === 1)
        return {
          state: "response",
          resolvedModel: request.model,
          body: { no: true },
        };
      return {
        state: "response",
        resolvedModel: request.model,
        body: measuredBody,
      };
    },
  };
  const result = await runJudgePanel(
    {
      atomId: "atom-1",
      prompt: "judge this",
      deterministicVerifierPassed: true,
    },
    transport,
  );
  assert.deepEqual(calls, ["gpt-5.6-terra", "gpt-5.6-terra", "gpt-5.6-luna"]);
  assert.equal(result.votes.length, 2);
  assert.equal(result.votes[0]?.attemptCount, 2);
  assert.equal(result.consensus.state, "pass");
});

test("panel makes at most four requests when both structured responses are malformed once", async () => {
  const calls: string[] = [];
  const result = await runJudgePanel(
    {
      atomId: "atom-max",
      prompt: "judge this",
      deterministicVerifierPassed: true,
    },
    {
      async request(request) {
        calls.push(request.model);
        return {
          state: "response",
          resolvedModel: request.model,
          body: { malformed: true },
        };
      },
    },
  );
  assert.equal(calls.length, 4);
  assert.deepEqual(
    result.votes.map((entry) => entry.state),
    ["malformed", "malformed"],
  );
});

test("panel performs zero provider calls after deterministic verifier failure", async () => {
  let calls = 0;
  const result = await runJudgePanel(
    {
      atomId: "atom-2",
      prompt: "judge this",
      deterministicVerifierPassed: false,
    },
    {
      async request() {
        calls += 1;
        throw new Error("must not run");
      },
    },
  );
  assert.equal(calls, 0);
  assert.deepEqual(result.votes, []);
  assert.equal(result.consensus.state, "deterministic_failure");
});

test("panel records provider errors and model drift without retries", async () => {
  const calls: string[] = [];
  const result = await runJudgePanel(
    {
      atomId: "atom-3",
      prompt: "judge this",
      deterministicVerifierPassed: true,
    },
    {
      async request(request) {
        calls.push(request.model);
        if (request.model === "gpt-5.6-terra")
          return { state: "provider_error" };
        return {
          state: "response",
          resolvedModel: "not-luna",
          body: measuredBody,
        };
      },
    },
  );
  assert.deepEqual(calls, ["gpt-5.6-terra", "gpt-5.6-luna"]);
  assert.deepEqual(
    result.votes.map((entry) => entry.state),
    ["provider_error", "model_drift"],
  );
  assert.equal(result.consensus.state, "insufficient_votes");
});

test("digests retain only canonical valid fields and sanitize malformed bodies", async () => {
  const canonical = async (body: unknown) =>
    runJudgePanel(
      { atomId: "atom-4", prompt: "safe", deterministicVerifierPassed: true },
      {
        async request(request) {
          return {
            state: "response" as const,
            resolvedModel: request.model,
            body,
          };
        },
      },
    );
  const first = await canonical({
    ...measuredBody,
    apiKey: "SECRET",
    created_at: "2026-01-01",
  });
  const second = await canonical({
    criticalFailure: false,
    invariantsPreserved: true,
    perspectiveAligned: true,
    evidenceIntegrity: true,
    taskAdequate: true,
    token: "DIFFERENT",
    timestamp: "never",
  });
  assert.deepEqual(
    first.votes.map((entry) => entry.responseDigest),
    second.votes.map((entry) => entry.responseDigest),
  );
  const malformedA = await canonical({
    apiKey: "SECRET",
    timestamp: "2026-01-01",
    nested: { token: "x", reason: "same" },
  });
  const malformedB = await canonical({
    apiKey: "OTHER",
    timestamp: "2027-01-01",
    nested: { token: "y", reason: "same" },
  });
  assert.equal(malformedA.votes[0]?.state, "malformed");
  assert.deepEqual(
    malformedA.votes.map((entry) => entry.responseDigest),
    malformedB.votes.map((entry) => entry.responseDigest),
  );
  assert.equal(JSON.stringify(malformedA).includes("SECRET"), false);
});

test("runtime panels project to the public vote and explicit result-state contract", async () => {
  const trialId =
    "trial-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const measured = await runJudgePanel(
    { atomId: "atom-wire", prompt: "judge", deterministicVerifierPassed: true },
    {
      async request(request) {
        return {
          state: "response",
          resolvedModel: request.model,
          body: measuredBody,
        };
      },
    },
  );
  const publicVotes = toPublicJudgeVotes(measured, {
    trialId,
    evidenceRefs: ["decision-1"],
  });
  assert.equal(judgeOutcomeState(measured), "measured");
  assert.equal(publicVotes.length, 2);
  assert.deepEqual(publicVotes.map(parseJudgeVote), publicVotes);
  assert.equal(publicVotes[0]?.state, "measured");
  if (publicVotes[0]?.state !== "measured") {
    assert.fail("expected a measured public vote");
  }
  assert.deepEqual(publicVotes[0], {
    release: "2026.8.12",
    trialId,
    judgeId: "openai:gpt-5.6-terra",
    requestedModelId: "gpt-5.6-terra",
    resolvedModelId: "gpt-5.6-terra",
    promptDigest: publicVotes[0]?.promptDigest,
    responseDigest: publicVotes[0]?.responseDigest,
    state: "measured",
    dimensions: measuredBody,
    evidenceRefs: ["decision-1"],
  });

  const unavailable = await runJudgePanel(
    { atomId: "atom-wire", prompt: "judge", deterministicVerifierPassed: true },
    {
      async request() {
        return { state: "provider_error" };
      },
    },
  );
  assert.equal(judgeOutcomeState(unavailable), "judge_unavailable");
  assert.deepEqual(
    toPublicJudgeVotes(unavailable, { trialId, evidenceRefs: [] }).map(
      (entry) => entry.state,
    ),
    ["judge_unavailable", "judge_unavailable"],
  );

  const disagreement = aggregateJudgeVotes([
    vote("gpt-5.6-terra", true),
    {
      ...vote("gpt-5.6-luna", true),
      dimensions: { ...measuredBody, invariantsPreserved: false },
    },
  ]);
  assert.equal(disagreement.state, "tie");
  assert.equal(
    judgeOutcomeState({ votes: [], consensus: disagreement, panelDigest: "x" }),
    "judge_disagreement",
  );
});

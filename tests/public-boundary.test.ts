import assert from "node:assert/strict";
import test from "node:test";

import * as contracts from "@openboa-ai/coffee-chat-bench";
import { bankCase } from "./fixtures.ts";

test("the package exposes neutral agent and bank contracts, not judge or product internals", async () => {
  for (const name of [
    "createCaseManifest",
    "parseCaseManifest",
    "createRunReceipt",
    "parseRunReceipt",
    "renderCase",
    "validateArtifact",
    "validateBank",
    "parseEvaluatorMaterial",
  ])
    assert.equal(
      typeof contracts[name as keyof typeof contracts],
      "function",
      name,
    );
  assert.equal("judgeOutputs" in contracts, false);
  assert.equal("createQualifiedJudgeConfiguration" in contracts, false);
  const { manifest } = await bankCase();
  const task = contracts.renderCase(manifest, {
    trialId: "trial-boundary",
    condition: "target_a",
  });
  assert.doesNotMatch(
    JSON.stringify(task),
    /pairId|condition|criterion|policy|evaluator/iu,
  );
});

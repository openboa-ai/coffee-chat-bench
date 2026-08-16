import assert from "node:assert/strict";
import test from "node:test";

import {
  RELEASE_ID,
  createCandidateIdentity,
  createCaseManifest,
  createRunReceipt,
  parseCaseManifest,
  parseRunReceipt,
  renderCase,
  stableDigest,
  validateArtifact,
} from "@openboa-ai/coffee-chat-bench";
import * as contracts from "@openboa-ai/coffee-chat-bench";

import { caseSemantic } from "./fixtures.ts";

test("the package exposes only the neutral benchmark execution contracts", () => {
  for (const contract of [
    createCaseManifest,
    parseCaseManifest,
    createRunReceipt,
    parseRunReceipt,
    renderCase,
    validateArtifact,
  ]) {
    assert.equal(typeof contract, "function");
  }
  assert.equal("createBenchmarkReport" in contracts, false);
  assert.equal("parseBenchmarkReport" in contracts, false);
  assert.equal("createJudgeConfiguration" in contracts, false);
  assert.equal("parseJudgeConfiguration" in contracts, false);
  assert.equal(typeof contracts.createQualifiedJudgeConfiguration, "function");

  const manifest = createCaseManifest(caseSemantic());
  const task = renderCase(manifest, {
    trialId: "trial-public-boundary",
    condition: "diagnostic_target_a",
  });
  const visible = JSON.stringify(task);
  assert.equal("sealed" in task, false);
  assert.equal("contexts" in task, false);
  assert.doesNotMatch(visible, /diagnostic_target_a|targetPairBlockId/u);
});

test("an arbitrary candidate system round-trips without Product internals", () => {
  const receipt = createRunReceipt({
    release: RELEASE_ID,
    benchCommit: "f".repeat(40),
    bankDigest: stableDigest({ bank: "public-agent-bank" }),
    trialId: "trial-generic-agent",
    caseId: "case-talk-001",
    manifestDigest: stableDigest({ manifest: "case-talk-001" }),
    taskDigest: stableDigest({ task: "trial-generic-agent" }),
    condition: "task_only",
    candidate: createCandidateIdentity({
      candidateId: "third-party-memory-agent",
      harness: "third-party-harness",
      model: "third-party-model",
      host: "harbor",
      adaptation: "retrieval_memory",
      configurationDigest: stableDigest({ adapter: "memory-adapter" }),
      toolPolicyDigest: stableDigest({ tools: ["read", "write"] }),
    }),
    session: {
      sessionDigest: stableDigest({ session: "generic" }),
      order: 0,
      leakage: "passed",
      leakageCheckDigest: stableDigest({ leakage: "generic" }),
    },
    execution: {
      kind: "conversation",
      hostReceiptDigest: stableDigest({ host: "generic" }),
      transcriptDigest: stableDigest({ transcript: "generic" }),
      turnCount: 1,
      termination: "completed",
      cleanup: "succeeded",
    },
    state: "succeeded",
    artifact: {
      digest: stableDigest({ output: "generic candidate output" }),
      bytes: 24,
      mediaType: "text/plain",
      validationDigest: stableDigest({ validation: "generic" }),
    },
    durationMs: 10,
    usage: null,
  });

  assert.deepEqual(parseRunReceipt(receipt), receipt);
  assert.equal(receipt.candidate.adaptation, "retrieval_memory");
});

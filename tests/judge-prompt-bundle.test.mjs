import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_JUDGE_PROTOCOL } from "../src/judge-protocol.ts";
import {
  JUDGE_PROMPT_DIMENSIONS,
  normalizeJudgePromptDocument,
} from "../scripts/judge-prompt-bundle.mjs";

function bundle() {
  return {
    artifact_type: "judge_prompt_bundle",
    mode: "independent_lanes",
    bundleId: "test-bundle",
    protocols: Object.fromEntries(
      JUDGE_PROMPT_DIMENSIONS.map((dimension) => [
        dimension,
        { protocol: structuredClone(DEFAULT_JUDGE_PROTOCOL) },
      ]),
    ),
  };
}

test("legacy single protocol is readable but is recorded as one protocol", () => {
  const normalized = normalizeJudgePromptDocument({
    protocol: structuredClone(DEFAULT_JUDGE_PROTOCOL),
  });

  assert.equal(normalized.mode, "single_protocol");
  assert.deepEqual(
    Object.keys(normalized.protocolsByDimension).sort(),
    [...JUDGE_PROMPT_DIMENSIONS].sort(),
  );
  assert.equal(new Set(Object.values(normalized.promptDigests)).size, 1);
  assert.equal(normalized.document.artifact_type, "judge_prompt_bundle");
});

test("changing one lane changes only that lane digest and the bundle digest", () => {
  const original = normalizeJudgePromptDocument(bundle());
  const changed = bundle();
  changed.protocols.task_performance.protocol.dimensions.task_performance.instruction +=
    " Require the requested deliverables to be directly usable.";
  const updated = normalizeJudgePromptDocument(changed);

  assert.notEqual(original.bundleDigest, updated.bundleDigest);
  for (const dimension of JUDGE_PROMPT_DIMENSIONS) {
    if (dimension === "task_performance")
      assert.notEqual(
        original.promptDigests[dimension],
        updated.promptDigests[dimension],
      );
    else
      assert.equal(
        original.promptDigests[dimension],
        updated.promptDigests[dimension],
      );
  }
});

test("an independent bundle must define every evaluation lane", () => {
  const incomplete = bundle();
  delete incomplete.protocols.evidence_grounding;
  assert.throws(
    () => normalizeJudgePromptDocument(incomplete),
    /must contain exactly/u,
  );
});

test("a supplied lane or bundle digest must match the prompt content", () => {
  const invalidLaneDigest = bundle();
  invalidLaneDigest.protocols.judgment_alignment.promptDigest =
    "sha256:0000000000000000000000000000000000000000000000000000000000000000";
  assert.throws(
    () => normalizeJudgePromptDocument(invalidLaneDigest),
    /promptDigest does not match/u,
  );

  const normalized = normalizeJudgePromptDocument(bundle());
  const invalidBundleDigest = {
    ...normalized.document,
    bundleDigest:
      "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  };
  assert.throws(
    () => normalizeJudgePromptDocument(invalidBundleDigest),
    /bundleDigest does not match/u,
  );
});

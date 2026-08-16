import assert from "node:assert/strict";
import test from "node:test";

import { renderCase, validateArtifact } from "../src/artifact.ts";
import { createCaseManifest } from "../src/contracts.ts";
import { caseSemantic } from "./fixtures.ts";

test("render-case emits one condition without sealed or treatment metadata", () => {
  const manifest = createCaseManifest(caseSemantic());
  const task = renderCase(manifest, {
    trialId: "trial-render-001",
    condition: "diagnostic_target_a",
  });
  const wire = JSON.stringify(task);

  assert.equal(task.context.length, 1);
  assert.deepEqual(task.environment, { kind: "conversation" });
  assert.match(task.context[0]!.content, /reversible experiments/i);
  assert.doesNotMatch(wire, /diagnostic_target_a|diagnostic_target_b/i);
  assert.doesNotMatch(wire, /rubric|judgmentPlan|targetPairBlock/i);
});

test("artifact validation checks bytes and citation IDs without scoring prose", () => {
  const manifest = createCaseManifest(caseSemantic());
  const valid = validateArtifact(
    manifest,
    Buffer.from("A bounded recommendation with [source-001].", "utf8"),
  );
  assert.equal(valid.state, "valid");

  const missing = validateArtifact(
    manifest,
    Buffer.from("A polished answer without its required citation.", "utf8"),
  );
  assert.deepEqual(missing, {
    state: "invalid",
    cause: "missing required reference source-001",
  });

  const bom = validateArtifact(
    manifest,
    Buffer.from("\ufeffAnswer [source-001]", "utf8"),
  );
  assert.deepEqual(bom, {
    state: "invalid",
    cause: "artifact must be UTF-8 without a byte-order mark",
  });
});

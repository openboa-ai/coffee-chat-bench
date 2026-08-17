import assert from "node:assert/strict";
import test from "node:test";

import { validateArtifact } from "../src/artifact.ts";
import { bankCase } from "./fixtures.ts";

test("artifact validation enforces only the objective output contract", async () => {
  const { manifest } = await bankCase();
  const valid = Buffer.from(
    manifest.task.output.requiredReferenceIds.map((id) => `[${id}]`).join("\n"),
    "utf8",
  );
  assert.equal(validateArtifact(manifest, valid).state, "valid");
  assert.equal(
    validateArtifact(manifest, Buffer.from("missing evidence", "utf8")).state,
    "invalid",
  );
  assert.equal(
    validateArtifact(manifest, Buffer.from([0xef, 0xbb, 0xbf, ...valid])).state,
    "invalid",
  );
  assert.equal(
    validateArtifact(manifest, Buffer.from([0xff, ...valid])).state,
    "invalid",
  );
});

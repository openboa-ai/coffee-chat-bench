import assert from "node:assert/strict";
import test from "node:test";

import { renderCase } from "../src/artifact.ts";
import {
  BENCHMARK_CONDITIONS,
  HISTORY_FORMATS,
  parseCaseManifest,
} from "../src/contracts.ts";
import { bankCase, rawCase } from "./fixtures.ts";

test("the public bank exposes one three-condition judgment-history contract", async () => {
  assert.deepEqual(BENCHMARK_CONDITIONS, [
    "unconditioned",
    "target_a",
    "target_b",
  ]);
  const { manifest } = await bankCase();
  assert.equal(manifest.contexts.unconditioned.length, 0);
  assert.equal(manifest.contexts.target_a.length, 8);
  assert.equal(manifest.contexts.target_b.length, 8);
  assert.deepEqual(
    Object.fromEntries(HISTORY_FORMATS.map((format) => [format, 2])),
    Object.fromEntries(
      HISTORY_FORMATS.map((format) => [
        format,
        manifest.contexts.target_a.filter((record) => record.format === format)
          .length,
      ]),
    ),
  );
});

test("rendering a condition gives an agent only the selected history", async () => {
  const { manifest } = await bankCase();
  const task = renderCase(manifest, {
    condition: "target_a",
  });
  const visible = JSON.stringify(task);
  assert.equal(task.context.length, 8);
  assert.doesNotMatch(
    visible,
    /"(?:target_b|pairId|policy|criterion|evaluator|historyRoles|cue|tieBreaker|veto)"\s*:/iu,
  );
  assert.ok(
    manifest.contexts.target_b
      .slice(0, 5)
      .every(({ content }) => !visible.includes(content)),
  );
  assert.equal(
    renderCase(manifest, {
      condition: "unconditioned",
    }).context.length,
    0,
  );
});

test("the public case contract has no dataset split field", async () => {
  const value = await rawCase();
  delete value.split;
  const manifest = parseCaseManifest(value);
  assert.equal("split" in manifest, false);
});

test("legacy condition shapes are rejected by the new contract", async () => {
  const value = await rawCase();
  value.contexts = { task_only: [] };
  assert.throws(
    () => parseCaseManifest(value),
    /case manifest\.contexts must contain exactly/iu,
  );
});

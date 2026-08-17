import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("Git ignores installed dependencies and normal generated outputs", () => {
  const paths = [
    "node_modules/",
    "coverage/",
    "dist/",
    "tsconfig.tsbuildinfo",
    "__pycache__/",
    "harbor/__pycache__/",
    "harbor/verifier.pyc",
  ];
  const result = spawnSync("git", ["check-ignore", "--stdin"], {
    cwd: root,
    encoding: "utf8",
    input: `${paths.join("\n")}\n`,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), paths);
});

test("package tooling exposes only the contract boundary and deterministic scripts", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { exports?: unknown; scripts?: Record<string, string> };

  assert.deepEqual(manifest.exports, {
    ".": "./src/benchmark-contracts.ts",
    "./schema": "./schemas/benchmark.schema.json",
  });
  assert.deepEqual(Object.keys(manifest.scripts ?? {}).sort(), [
    "check:inactive",
    "ci:policy",
    "data:audit",
    "format",
    "format:check",
    "test",
    "typecheck",
  ]);
  assert.match(
    manifest.scripts?.["ci:policy"] ?? "",
    /workflow-policy\.test\.mjs.*\.github\/ci-policy\.mjs/u,
  );
  assert.doesNotMatch(
    Object.values(manifest.scripts ?? {}).join("\n"),
    /openai|provider|harbor\s+run|judge|calibrat/iu,
  );
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

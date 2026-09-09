import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const source = resolve(import.meta.dirname, "..");
function fixture(mutate = () => {}) {
  const root = mkdtempSync(join(tmpdir(), "coffee-chat-bench-verify-"));
  const env = { ...process.env, CI_POLICY_ROOT: root };
  delete env.GIT_INDEX_FILE;
  try {
    const files = execFileSync("git", ["ls-files", "-z"], { cwd: source, encoding: "utf8", env }).split("\0").filter(Boolean);
    for (const path of files) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      cpSync(join(source, path), join(root, path));
    }
    mutate(root);
    execFileSync("git", ["init", "-q"], { cwd: root, env });
    execFileSync("git", ["add", "-f", "--all"], { cwd: root, env });
    return spawnSync(process.execPath, [join(source, ".github/verify.mjs")], { cwd: root, env, encoding: "utf8" });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

for (const path of [".github/product-behavior.js", ".githooks/eval-results.json"]) {
  test(`rejects unexpected infrastructure artifact: ${path}`, () => {
    const result = fixture((root) => writeFileSync(join(root, path), "{}"));
    assert.notEqual(result.status, 0, result.stdout);
  });
}

test("accepts the current repository contract", () => {
  const result = fixture();
  assert.equal(result.status, 0, result.stderr);
});

test("rejects unpublished cases in the empty public benchmark", () => {
  const result = fixture((root) => writeFileSync(join(root, "evals/evals.json"), "[]"));
  assert.notEqual(result.status, 0, result.stdout);
});
test("rejects nonempty placeholders", () => {
  const result = fixture((root) => writeFileSync(join(root, "evals/output-quality/perspective-capture/.gitkeep"), "unreviewed data"));
  assert.notEqual(result.status, 0, result.stdout);
});

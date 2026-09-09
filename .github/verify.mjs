import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.env.CI_POLICY_ROOT ?? ".");
const trackedFiles = execFileSync("git", ["-C", root, "ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
// Compare complete paths: a same-named directory is not an allowed file.
// This is the published repository layout, not central security policy.
assert.deepEqual(trackedFiles.slice().sort(), [
  ".gitattributes",
  ".githooks/pre-commit",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/dependabot.yml",
  ".github/merge-policy.json",
  ".github/verify.mjs",
  ".github/verify.test.mjs",
  ".github/workflows/trusted.yml",
  ".gitignore",
  "AGENTS.md",
  "CODEOWNERS",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "evals/README.md",
  "evals/output-quality/perspective-application/agent-judgment-action/.gitkeep",
  "evals/output-quality/perspective-application/human-understanding/.gitkeep",
  "evals/output-quality/perspective-capture/.gitkeep",
  "evals/triggering/perspective-application/.gitkeep",
  "evals/triggering/perspective-capture/.gitkeep",
  "graders/README.md",
  "package-lock.json",
  "package.json",
  "research/README.md"
], "unexpected or missing repository file");
for (const path of trackedFiles) {
  assert.equal(lstatSync(resolve(root, path)).isFile(), true, `${path}: regular file required`);
}

for (const path of trackedFiles.filter((path) => path.endsWith("/.gitkeep"))) {
  assert.equal(readFileSync(resolve(root, path), "utf8"), "", `${path} must remain empty`);
}

const forbidden = [
  "bank",
  "harbor",
  "qualification",
  "schemas",
  "src",
  "tests",
  "scripts",
];
for (const directory of forbidden) {
  assert.equal(existsSync(resolve(root, directory)), false, directory);
}

const readme = readFileSync(resolve(root, "README.md"), "utf8");
assert.match(readme, /Ground Truth/u);
assert.match(readme, /Each future case uses the same envelope:/u);
for (const marker of ["prompt/", "input/", "expected-output/"]) {
  assert.match(readme, new RegExp(`\\b${marker.replace("/", "\\/")}`, "u"), marker);
}
console.log("Coffee Chat Bench structure verification passed.");

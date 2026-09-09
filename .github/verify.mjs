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
// Infrastructure directories are not an escape hatch for Product/data artifacts.
// Central controls validate security semantics; this repository owns its layout.
assert.deepEqual(
  trackedFiles.filter((path) => path.startsWith(".github/") || path.startsWith(".githooks/")).sort(),
  [
    ".githooks/pre-commit",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/dependabot.yml",
    ".github/merge-policy.json",
    ".github/verify.mjs",
    ".github/verify.test.mjs",
    ".github/workflows/trusted.yml",
  ],
  "unexpected or missing infrastructure file",
);

function trackedEntries(directory = ".") {
  const prefix = directory === "." ? "" : `${directory.replace(/\/$/u, "")}/`;
  const entries = new Set();
  for (const file of trackedFiles) {
    if (!file.startsWith(prefix)) continue;
    const remainder = file.slice(prefix.length);
    if (!remainder) continue;
    entries.add(remainder.split("/")[0]);
  }
  return [...entries].sort();
}
function checkoutEntries(directory = ".") {
  const entries = trackedEntries(directory);
  if (directory === ".") entries.push(".git");
  return entries.sort();
}
assert.deepEqual(checkoutEntries(), [
  ".git",
  ".gitattributes",
  ".githooks",
  ".github",
  ".gitignore",
  "AGENTS.md",
  "CODEOWNERS",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "evals",
  "graders",
  "package-lock.json",
  "package.json",
  "research",
]);

const expectedFiles = [
  "README.md",
  "evals/README.md",
  "graders/README.md",
  "research/README.md",
];
for (const file of expectedFiles) {
  assert.equal(existsSync(resolve(root, file)), true, file);
}

const expectedDirectoryEntries = new Map([
  ["evals", ["README.md", "output-quality", "triggering"]],
  ["evals/output-quality", ["perspective-application", "perspective-capture"]],
  [
    "evals/output-quality/perspective-application",
    ["agent-judgment-action", "human-understanding"],
  ],
  ["evals/output-quality/perspective-capture", [".gitkeep"]],
  [
    "evals/output-quality/perspective-application/human-understanding",
    [".gitkeep"],
  ],
  [
    "evals/output-quality/perspective-application/agent-judgment-action",
    [".gitkeep"],
  ],
  ["evals/triggering", ["perspective-application", "perspective-capture"]],
  ["evals/triggering/perspective-capture", [".gitkeep"]],
  ["evals/triggering/perspective-application", [".gitkeep"]],
]);
for (const [directory, entries] of expectedDirectoryEntries) {
  assert.deepEqual(trackedEntries(directory), entries, directory);
  for (const entry of entries) {
    if (entry === ".gitkeep") {
      const placeholderPath = resolve(root, directory, entry);
      const placeholder = lstatSync(placeholderPath);
      assert.equal(placeholder.isSymbolicLink(), false, `${directory}/${entry} must not be a symlink`);
      assert.equal(placeholder.isFile(), true, `${directory}/${entry} must be a regular file`);
      assert.equal(
        readFileSync(placeholderPath, "utf8"),
        "",
        `${directory}/${entry} must remain empty`,
      );
    }
  }
}
for (const directory of ["graders", "research"]) {
  assert.deepEqual(trackedEntries(directory), ["README.md"], directory);
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

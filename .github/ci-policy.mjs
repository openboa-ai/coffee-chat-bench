import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.env.CI_POLICY_ROOT ?? ".");
assert.equal(existsSync(resolve(root, ".npmrc")), false);
assert.equal(existsSync(resolve(root, "npm-shrinkwrap.json")), false);
assert.deepEqual(
  readdirSync(resolve(root, ".github/workflows"))
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort(),
  ["trusted.yml"],
);

const expectedFiles = [
  "README.md",
  "evals/README.md",
  "graders/README.md",
  "research/README.md",
];
for (const file of expectedFiles) {
  assert.equal(existsSync(resolve(root, file)), true, file);
}

const expectedDirectories = [
  "evals/output-quality/perspective-capture",
  "evals/output-quality/perspective-application/human-understanding",
  "evals/output-quality/perspective-application/agent-judgment-action",
  "evals/triggering/perspective-capture",
  "evals/triggering/perspective-application",
];
for (const directory of expectedDirectories) {
  assert.deepEqual(
    readdirSync(resolve(root, directory)).sort(),
    [".gitkeep"],
    directory,
  );
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

assert.match(readFileSync(resolve(root, "README.md"), "utf8"), /Ground Truth/u);
console.log("Coffee Chat Bench structure and policy passed.");

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.env.CI_POLICY_ROOT ?? ".");
const TRUSTED_CONTROL_SHA = "f556732d4fdc447f94b5e7adca33ad84c4accb95";
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
assert.equal(existsSync(resolve(root, ".npmrc")), false);
assert.equal(existsSync(resolve(root, "npm-shrinkwrap.json")), false);
assert.deepEqual(
  readdirSync(resolve(root, ".github/workflows"))
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort(),
  ["trusted.yml"],
);
assert.equal(
  readFileSync(resolve(root, ".github/workflows/trusted.yml"), "utf8"),
  `name: OpenBoa Coffee trusted gate

on:
  pull_request_target:
    types: [opened, synchronize, reopened, ready_for_review]

permissions: {}

jobs:
  trusted:
    name: OpenBoa Coffee trusted required
    permissions:
      actions: read
      contents: read
      security-events: write
    uses: openboa-ai/.github/.github/workflows/coffee-trusted-gate.yml@${TRUSTED_CONTROL_SHA}
    with:
      control_sha: ${TRUSTED_CONTROL_SHA}
`,
  "trusted wrapper must remain exact",
);
assert.deepEqual(readdirSync(root).sort(), [
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

assert.deepEqual(readJson(".github/merge-policy.json"), {
  repository_role: "bench",
  merge_method: "squash",
  auto_merge: "github-native",
  merge_queue: false,
  required_events: ["pull_request"],
  eligible_author_associations: ["OWNER", "MEMBER"],
  eligible_bot_logins: ["dependabot[bot]"],
  required_approvals: 0,
  required_checks: [
    {
      context: "OpenBoa Coffee trusted required / OpenBoa Coffee trusted required",
      integration_id: 15368,
    },
  ],
  sensitive_review: {
    enforcement: "github_environment",
    environment: "coffee-security",
    required_approvals: 1,
    prevent_self_review: false,
  },
  protected_paths: [
    "/.github/**",
    "/.githooks/**",
    "/.gitleaksignore",
    "/.gitleaks.toml",
    "/AGENTS.md",
    "/CODEOWNERS",
    "/SECURITY.md",
    "/.npmrc",
    "/npm-shrinkwrap.json",
    "/package.json",
    "/package-lock.json",
    "/prettier.config.mjs",
    "/evals/**",
    "/graders/**",
    "/research/**",
  ],
});

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
  assert.deepEqual(readdirSync(resolve(root, directory)).sort(), entries, directory);
}
for (const directory of ["graders", "research"]) {
  assert.deepEqual(readdirSync(resolve(root, directory)).sort(), ["README.md"], directory);
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

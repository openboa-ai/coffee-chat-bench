import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.env.CI_POLICY_ROOT ?? ".");
const TRUSTED_CONTROL_SHA = "f33da6bbcdfebd0693ff7673d750f369629e000e";
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const trackedFiles = execFileSync("git", ["-C", root, "ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
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
assert.equal(existsSync(resolve(root, ".npmrc")), false);
assert.equal(existsSync(resolve(root, "npm-shrinkwrap.json")), false);
assert.deepEqual(
  readdirSync(resolve(root, ".github/workflows")).sort(),
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

assert.deepEqual(readJson("package.json"), {
  name: "@openboa-ai/coffee-chat-bench",
  version: "0.0.0",
  private: true,
  type: "module",
  scripts: { verify: "node .github/ci-policy.mjs" },
});
assert.deepEqual(readJson("package-lock.json"), {
  name: "@openboa-ai/coffee-chat-bench",
  version: "0.0.0",
  lockfileVersion: 3,
  requires: true,
  packages: {
    "": {
      name: "@openboa-ai/coffee-chat-bench",
      version: "0.0.0",
    },
  },
});
assert.deepEqual(readdirSync(resolve(root, ".github")).sort(), [
  "PULL_REQUEST_TEMPLATE.md",
  "ci-policy.mjs",
  "dependabot.yml",
  "merge-policy.json",
  "workflows",
]);
assert.deepEqual(readdirSync(resolve(root, ".githooks")).sort(), ["pre-commit"]);

assert.equal(
  readFileSync(resolve(root, "CODEOWNERS"), "utf8"),
  `# No wildcard owner: ordinary paths may become eligible for strong-CI auto-merge.
/.github/** @openboa-ai/security-maintainers
/.githooks/** @openboa-ai/security-maintainers
/.gitleaks* @openboa-ai/security-maintainers
/AGENTS.md @openboa-ai/security-maintainers
/CODEOWNERS @openboa-ai/security-maintainers
/LICENSE @openboa
/README.md @openboa
/.npmrc @openboa-ai/security-maintainers
/npm-shrinkwrap.json @openboa-ai/security-maintainers
/package.json @openboa-ai/security-maintainers
/package-lock.json @openboa-ai/security-maintainers
/prettier.config.mjs @openboa-ai/security-maintainers
/SECURITY.md @openboa-ai/security-maintainers
/evals/** @openboa-ai/security-maintainers
/graders/** @openboa-ai/security-maintainers
/research/** @openboa-ai/security-maintainers
`,
  "CODEOWNERS must preserve the benchmark ownership routes",
);
assert.match(
  readFileSync(resolve(root, "SECURITY.md"), "utf8"),
  /security@openboa\.ai/u,
  "SECURITY.md must provide a private reporting channel",
);

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
    "/README.md",
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
  assert.deepEqual(trackedEntries(directory), entries, directory);
  for (const entry of entries) {
    if (entry === ".gitkeep") {
      assert.equal(
        readFileSync(resolve(root, directory, entry), "utf8"),
        "",
        `${directory}/${entry} must remain empty`,
      );
    }
  }
}
for (const directory of ["graders", "research"]) {
  assert.deepEqual(trackedEntries(directory), ["README.md"], directory);
}

assert.equal(
  readFileSync(resolve(root, ".github/dependabot.yml"), "utf8"),
  `version: 2

updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    commit-message:
      prefix: deps
    allow:
      - dependency-name: "*"
        update-types:
          - version-update:semver-minor
          - version-update:semver-patch
    groups:
      security:
        applies-to: security-updates
        patterns:
          - "*"
      production:
        applies-to: version-updates
        dependency-type: production
        update-types: [minor, patch]
      development:
        applies-to: version-updates
        dependency-type: development
        update-types: [minor, patch]
  - package-ecosystem: github-actions
    directory: "/"
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    commit-message:
      prefix: deps
    allow:
      - dependency-name: "*"
        update-types:
          - version-update:semver-minor
          - version-update:semver-patch
    groups:
      security:
        applies-to: security-updates
        patterns:
          - "*"
      versions:
        applies-to: version-updates
        update-types: [minor, patch]
        patterns:
          - "*"
`,
  "Dependabot policy must remain bounded to approved update lanes",
);

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
console.log("Coffee Chat Bench structure and policy passed.");

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadPolicyParser } from "./policy-bootstrap.mjs";

const controlRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(process.env.BENCH_CI_POLICY_ROOT ?? controlRoot);
const { parseDocument } = loadPolicyParser(controlRoot);
const workflowRoot = resolve(root, ".github/workflows");
const failures = [];
if (existsSync(resolve(root, ".npmrc"))) {
  failures.push("root .npmrc must be absent");
}
if (existsSync(resolve(root, ".github/policy-parser/.npmrc"))) {
  failures.push("isolated policy parser .npmrc must be absent before install");
}
if (existsSync(resolve(root, "npm-shrinkwrap.json"))) {
  failures.push("root npm-shrinkwrap.json must be absent");
}
if (existsSync(resolve(root, ".github/policy-parser/npm-shrinkwrap.json"))) {
  failures.push(
    "isolated policy parser npm-shrinkwrap.json must be absent before loading",
  );
}
const YAML_MAX_BYTES = 256 * 1024;
const YAML_MAX_ALIASES = 100;
const YAML_MAX_DEPTH = 32;
const YAML_MAX_NODES = 10_000;
const YAML_MAX_STRING_BYTES = 256 * 1024;
function assertYamlResourceBudget(value, label) {
  const pending = [{ value, depth: 0 }];
  const seen = new WeakSet();
  let nodes = 0;
  let stringBytes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    nodes += 1;
    if (nodes > YAML_MAX_NODES) {
      fail(`${label}: document node limit exceeded`);
      return false;
    }
    if (current.depth > YAML_MAX_DEPTH) {
      fail(`${label}: document depth limit exceeded`);
      return false;
    }
    if (typeof current.value === "string") {
      stringBytes += Buffer.byteLength(current.value, "utf8");
      if (stringBytes > YAML_MAX_STRING_BYTES) {
        fail(`${label}: document string limit exceeded`);
        return false;
      }
      continue;
    }
    if (!current.value || typeof current.value !== "object") continue;
    if (seen.has(current.value)) continue;
    seen.add(current.value);
    const children = Array.isArray(current.value)
      ? current.value
      : Object.entries(current.value).flat();
    for (const child of children) {
      pending.push({ value: child, depth: current.depth + 1 });
    }
  }
  return true;
}

function parseBoundedYaml(relativePath, label) {
  const source = readFileSync(resolve(root, relativePath), "utf8");
  if (Buffer.byteLength(source, "utf8") > YAML_MAX_BYTES) {
    fail(`${label}: document byte limit exceeded`);
    return undefined;
  }
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length > 0) {
    fail(`${label} must parse uniquely`);
    return undefined;
  }
  let value;
  try {
    value = document.toJS({ maxAliasCount: YAML_MAX_ALIASES });
  } catch {
    fail(`${label}: alias resource limit exceeded`);
    return undefined;
  }
  return assertYamlResourceBudget(value, label) ? value : undefined;
}
function fail(message) {
  failures.push(message);
}

function equal(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const SHA512_INTEGRITY = /^sha512-[A-Za-z0-9+/]+={0,2}$/u;

function packageNameFromLockPath(path) {
  const marker = "node_modules/";
  const index = path.lastIndexOf(marker);
  return index === -1 ? null : path.slice(index + marker.length);
}

function expectedRegistryUrl(name, version) {
  const tarballName = name.slice(name.lastIndexOf("/") + 1);
  return `https://registry.npmjs.org/${name}/-/${tarballName}-${version}.tgz`;
}

function validatePackageLock(packageJson, allowedDevDependencies) {
  let lock;
  try {
    lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  } catch (error) {
    fail(
      `package lock must parse: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }
  const rootPackage = lock?.packages?.[""];
  const devDependencies = packageJson.devDependencies ?? {};
  if (
    lock.lockfileVersion !== 3 ||
    lock.requires !== true ||
    lock.name !== packageJson.name ||
    lock.version !== packageJson.version ||
    !isRecord(lock.packages) ||
    !isRecord(rootPackage) ||
    rootPackage.name !== packageJson.name ||
    rootPackage.version !== packageJson.version ||
    !equal(rootPackage.devDependencies ?? {}, devDependencies) ||
    !equal(rootPackage.dependencies ?? {}, packageJson.dependencies ?? {}) ||
    !equal(
      Object.keys(devDependencies).sort(),
      [...allowedDevDependencies].sort(),
    ) ||
    !Object.values(devDependencies).every(
      (version) => typeof version === "string" && EXACT_VERSION.test(version),
    )
  ) {
    fail("package lock must match the approved dependency contract");
    return;
  }
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (path === "") continue;
    const name = packageNameFromLockPath(path);
    if (
      name === null ||
      !isRecord(entry) ||
      typeof entry.version !== "string" ||
      !EXACT_VERSION.test(entry.version) ||
      entry.resolved !== expectedRegistryUrl(name, entry.version) ||
      typeof entry.integrity !== "string" ||
      !SHA512_INTEGRITY.test(entry.integrity) ||
      entry.link === true ||
      entry.hasInstallScript === true
    ) {
      fail("package lock must preserve registry identity and integrity");
      return;
    }
  }
}

function exactKeys(value, keys) {
  return isRecord(value) && equal(Object.keys(value).sort(), [...keys].sort());
}

function validateDependabot() {
  const updates = parseBoundedYaml(
    ".github/dependabot.yml",
    "dependabot.yml",
  )?.updates;
  if (!Array.isArray(updates) || updates.length !== 2) {
    fail("dependabot.yml: exact update lanes");
    return;
  }
  const npm = updates.find((update) => update?.["package-ecosystem"] === "npm");
  const actions = updates.find(
    (update) => update?.["package-ecosystem"] === "github-actions",
  );
  const minorPatch = ["minor", "patch"];
  const compatibleVersionUpdates = [
    {
      "dependency-name": "*",
      "update-types": [
        "version-update:semver-minor",
        "version-update:semver-patch",
      ],
    },
  ];
  if (
    !equal(npm?.groups?.production, {
      "applies-to": "version-updates",
      "dependency-type": "production",
      "update-types": minorPatch,
    }) ||
    !equal(npm?.groups?.development, {
      "applies-to": "version-updates",
      "dependency-type": "development",
      "update-types": minorPatch,
    }) ||
    !equal(npm?.groups?.security, {
      "applies-to": "security-updates",
      patterns: ["*"],
    }) ||
    !equal(npm?.allow, compatibleVersionUpdates) ||
    Object.hasOwn(npm, "ignore")
  ) {
    fail("dependabot.yml: npm update policy");
  }
  if (
    !equal(actions?.groups?.versions, {
      "applies-to": "version-updates",
      "update-types": minorPatch,
      patterns: ["*"],
    }) ||
    !equal(actions?.groups?.security, {
      "applies-to": "security-updates",
      patterns: ["*"],
    }) ||
    !equal(actions?.allow, compatibleVersionUpdates) ||
    Object.hasOwn(actions, "ignore")
  ) {
    fail("dependabot.yml: GitHub Actions update policy");
  }
}

function validateMergePolicy() {
  let policy;
  try {
    policy = JSON.parse(
      readFileSync(resolve(root, ".github/merge-policy.json"), "utf8"),
    );
  } catch (error) {
    fail(
      `merge policy: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  if (
    policy.merge_method !== "squash" ||
    policy.auto_merge !== "github-native" ||
    policy.merge_queue !== false ||
    policy.required_approvals !== 0 ||
    !equal(policy.required_events, ["pull_request"]) ||
    !equal(policy.eligible_author_associations, ["OWNER", "MEMBER"]) ||
    !equal(policy.eligible_bot_logins, ["dependabot[bot]"])
  ) {
    fail("merge policy is not zero-approval GitHub-native squash");
  }
  if (
    !equal(policy.required_checks, [
      {
        context:
          "OpenBoa Coffee trusted required / OpenBoa Coffee trusted required",
        integration_id: 15368,
      },
    ])
  ) {
    fail("merge policy must require exact GitHub Actions checks");
  }
  if (
    !equal(policy.sensitive_review, {
      enforcement: "github_environment",
      environment: "coffee-security",
      required_approvals: 1,
      prevent_self_review: false,
    })
  ) {
    fail("merge policy must retain the protected Environment review");
  }
  if (
    !equal(policy.protected_paths, [
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
      "/bank/**",
      "/docs/**",
      "/docs/validity/**",
      "/harbor/**",
      "/qualification/**",
      "/scripts/check-inactive-boundary.mjs",
      "/schemas/**",
      "/src/**",
      "/tests/**",
    ])
  ) {
    fail("merge policy must preserve exact sensitive paths");
  }
}

function validateCodeowners() {
  const expected = `# No wildcard owner: ordinary paths may become eligible for strong-CI auto-merge.
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
/bank/** @openboa-ai/security-maintainers
/docs/** @openboa-ai/security-maintainers
/docs/validity/** @openboa-ai/security-maintainers
/harbor/** @openboa-ai/security-maintainers
/qualification/** @openboa-ai/security-maintainers
/schemas/** @openboa-ai/security-maintainers
/src/** @openboa-ai/security-maintainers
/scripts/** @openboa
/scripts/check-inactive-boundary.mjs @openboa-ai/security-maintainers
/tests/** @openboa-ai/security-maintainers
/docs/quality-map.md @openboa
`;
  if (readFileSync(resolve(root, "CODEOWNERS"), "utf8") !== expected) {
    fail("CODEOWNERS must preserve exact sensitive ownership");
  }
}

const discovered = readdirSync(workflowRoot)
  .filter((name) => /\.ya?ml$/u.test(name))
  .sort();
if (!equal(discovered, ["trusted.yml"])) {
  fail("target repository must expose only the trusted wrapper");
}

const trustedWorkflowSource = readFileSync(
  resolve(workflowRoot, "trusted.yml"),
  "utf8",
);
const trustedControlSha = "f33da6bbcdfebd0693ff7673d750f369629e000e";
const expectedTrustedWorkflow = `name: OpenBoa Coffee trusted gate

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
    uses: openboa-ai/.github/.github/workflows/coffee-trusted-gate.yml@${trustedControlSha}
    with:
      control_sha: ${trustedControlSha}
`;
if (trustedWorkflowSource !== expectedTrustedWorkflow) {
  fail("trusted wrapper must remain exact");
}

const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
if (
  packageJson.scripts?.["ci:policy"] !==
  "node --test tests/workflow-policy.test.mjs && node .github/ci-policy.mjs"
) {
  fail("package command must run fixtures before the checker");
}
const expectedPackageScripts = {
  "ci:policy":
    "node --test tests/workflow-policy.test.mjs && node .github/ci-policy.mjs",
  "data:audit": "node --experimental-strip-types scripts/data-audit.mjs bank",
  test: "node --experimental-strip-types --test tests/*.test.mjs tests/*.test.ts",
  typecheck: "tsc --noEmit",
  format:
    'prettier --write AGENTS.md README.md DATA-CARD.md PREREGISTRATION.md OVERLAP-REPORT.json package.json package-lock.json tsconfig.json prettier.config.mjs docs/*.md docs/validity/*.md harbor/*.md qualification/*.md qualification/*.json "bank/**/*.json" harbor/*.ts schemas/*.json scripts/*.mjs src/*.ts tests/*.mjs tests/*.ts',
  "format:check":
    'prettier --check AGENTS.md README.md DATA-CARD.md PREREGISTRATION.md OVERLAP-REPORT.json package.json package-lock.json tsconfig.json prettier.config.mjs docs/*.md docs/validity/*.md harbor/*.md qualification/*.md qualification/*.json "bank/**/*.json" harbor/*.ts schemas/*.json scripts/*.mjs src/*.ts tests/*.mjs tests/*.ts',
  "check:inactive": "node scripts/check-inactive-boundary.mjs --root .",
};
if (
  !equal(
    Object.entries(packageJson.scripts ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    Object.entries(expectedPackageScripts).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
) {
  fail("package scripts must remain exact");
}
if (
  !exactKeys(packageJson, [
    "name",
    "private",
    "version",
    "type",
    "exports",
    "engines",
    "scripts",
    "devDependencies",
  ]) ||
  packageJson.name !== "@openboa-ai/coffee-chat-bench" ||
  packageJson.private !== true ||
  packageJson.version !== "2026.8.19" ||
  packageJson.type !== "module" ||
  !equal(packageJson.exports, {
    ".": "./src/benchmark-contracts.ts",
    "./schema": "./schemas/benchmark.schema.json",
  }) ||
  !equal(packageJson.engines, { node: ">=24" })
) {
  fail("package metadata must remain exact");
}
validatePackageLock(packageJson, [
  "@types/node",
  "ajv",
  "prettier",
  "typescript",
]);
validateDependabot();
validateMergePolicy();
validateCodeowners();

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("CI policy passed\n");
}

#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const migrationEvidencePaths = new Set([
  "docs/migration/equality/task-4-inactive-benchmark-trust-base.json",
  "docs/migration/receipts/task-4-inactive-benchmark-trust-base.json",
  "docs/migration/selections/task-4-inactive-benchmark-trust-base.json",
]);
const allowedStaticPaths = new Set([
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  "AGENTS.md",
  "CODEOWNERS",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "package-lock.json",
  "package.json",
  "prettier.config.mjs",
  "tsconfig.json",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ci-policy.mjs",
  ".github/coverage-requirements.txt",
  ".github/dependabot.yml",
  ".github/merge-policy.json",
  ".github/migration-equality-receipt.schema.json",
  ".github/migration-receipt.schema.json",
  ".github/migration-selection.schema.json",
  ".github/workflows/codeql.yml",
  ".github/workflows/github-coverage.yml",
  ".github/workflows/policy.yml",
  ".github/workflows/quality.yml",
  "docs/quality-map.md",
  "scripts/check-inactive-boundary.mjs",
  "scripts/check-migration-receipt.mjs",
  "tests/governance-policy.test.mjs",
  "tests/inactive-boundary.test.mjs",
  ...migrationEvidencePaths,
]);

const forbiddenDirectory =
  /^(?:cases|candidates|datasets|eval|metrics|pilots|results|runners|scorers|schemas|src|tasks|verifiers)(?:\/|$)/u;
const forbiddenContent =
  /\b(?:tasks|datasets|cases|metrics|scorers|verifiers|runners|results|pilots|candidate imports?|performance claims?|provisional taste constructs?)\b/iu;
const controlPaths = new Set([
  "scripts/check-inactive-boundary.mjs",
  "tests/inactive-boundary.test.mjs",
]);
const activationCriteriaPath = "docs/validity/activation-criteria.md";
const forbiddenActivationContent =
  /\b(?:tasks?|cases?|metrics?|datasets?|scores?|results?)\b/iu;
const forbiddenExecutableContent =
  /\b(?:export\s+)?(?:const|let|var|function|class)\s+(?:tasks?|datasets?|cases?|metrics?|scores?|scorers?|verifiers?|runners?|pilots?|candidates?)\b|\b(?:tasks?|datasets?|cases?|metrics?|scores?|scorers?|verifiers?|runners?|pilots?|candidates?)\s*[:=]\s*(?:\{|\[|\(?[^;\n]*=>|function\b)/iu;

function fail(message) {
  throw new Error(message);
}

function parseRoot(argv) {
  if (argv.length !== 2 || argv[0] !== "--root" || !argv[1]) {
    fail("usage: check-inactive-boundary.mjs --root <repository>");
  }
  return resolve(argv[1]);
}

function filesUnder(root, directory = root) {
  const entries = readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if (entry.name === ".git" || entry.name === "node_modules") return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(root, path);
    if (!entry.isFile())
      fail(`unsupported filesystem entry: ${relative(root, path)}`);
    return [relative(root, path).split("\\").join("/")];
  });
}

function trackedPaths(root) {
  const result = spawnSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return [];
  return result.stdout.split("\0").filter(Boolean);
}

function isAllowedPath(path) {
  return allowedStaticPaths.has(path) || path === activationCriteriaPath;
}

function isSubjectToBoundary(path) {
  return !controlPaths.has(path) && !migrationEvidencePaths.has(path);
}

function main() {
  const root = parseRoot(process.argv.slice(2));
  const paths = filesUnder(root).sort();
  for (const path of trackedPaths(root)) {
    if (path === "node_modules" || path.startsWith("node_modules/")) {
      fail(`forbidden tracked path: ${path}`);
    }
  }

  for (const path of paths) {
    if (forbiddenDirectory.test(path)) fail(`forbidden path: ${path}`);
    if (!isAllowedPath(path)) fail(`unapproved path: ${path}`);
    const content = readFileSync(resolve(root, path), "utf8");
    if (forbiddenExecutableContent.test(content)) {
      fail(`forbidden executable content: ${path}`);
    }
    if (!isSubjectToBoundary(path)) continue;
    if (
      forbiddenContent.test(content) ||
      (path === activationCriteriaPath &&
        forbiddenActivationContent.test(content))
    ) {
      fail(`forbidden content outside docs/validity: ${path}`);
    }
  }

  process.stdout.write(
    `${JSON.stringify({ status: "passed", repository_status: "not_active", files: paths.length })}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}

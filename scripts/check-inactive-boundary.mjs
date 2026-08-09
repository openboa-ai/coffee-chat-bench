#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

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
  ".github/dependabot.yml",
  ".github/merge-policy.json",
  ".github/migration-equality-receipt.schema.json",
  ".github/migration-receipt.schema.json",
  ".github/migration-selection.schema.json",
  ".github/workflows/codeql.yml",
  ".github/workflows/policy.yml",
  ".github/workflows/quality.yml",
  "docs/quality-map.md",
  "scripts/check-inactive-boundary.mjs",
  "scripts/check-migration-receipt.mjs",
  "tests/governance-policy.test.mjs",
  "tests/inactive-boundary.test.mjs",
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

function isAllowedPath(path) {
  return (
    allowedStaticPaths.has(path) ||
    path.startsWith("docs/migration/") ||
    path === activationCriteriaPath
  );
}

function isSubjectToBoundary(path) {
  return !controlPaths.has(path) && !path.startsWith("docs/migration/");
}

function main() {
  const root = parseRoot(process.argv.slice(2));
  const paths = filesUnder(root).sort();

  for (const path of paths) {
    if (forbiddenDirectory.test(path)) fail(`forbidden path: ${path}`);
    if (!isAllowedPath(path)) fail(`unapproved path: ${path}`);
    if (!isSubjectToBoundary(path)) continue;
    const content = readFileSync(resolve(root, path), "utf8");
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

#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const allowedPaths = new Set([
  ".gitattributes",
  ".gitignore",
  ".githooks/pre-commit",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/dependabot.yml",
  ".github/scripts/install-gitleaks.sh",
  ".github/workflows/codeql.yml",
  ".github/workflows/policy.yml",
  ".github/workflows/quality.yml",
  "AGENTS.md",
  "CODEOWNERS",
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "docs/quality-map.md",
  "docs/validity/activation-criteria.md",
  "scripts/check-inactive-boundary.mjs",
  "tests/inactive-boundary.test.mjs",
  "tests/secret-prevention.test.mjs",
]);
const benchmarkDirectories = new Set([
  "cases",
  "candidates",
  "datasets",
  "eval",
  "metrics",
  "pilots",
  "results",
  "runners",
  "scorers",
  "schemas",
  "src",
  "tasks",
  "verifiers",
]);
const publicContracts = [
  [
    "AGENTS.md",
    "status is `not_active`",
    "does not provide an active benchmark or executable measurement material",
  ],
  [
    "README.md",
    "Repository status: `not_active`.",
    "does not provide a benchmark, metric, result, or validity claim",
  ],
];
const publicDocuments = [...allowedPaths].filter((path) => path.endsWith(".md"));

function fail(message) {
  throw new Error(message);
}
function parseRoot(argv) {
  if (argv.length !== 2 || argv[0] !== "--root" || !argv[1]) {
    fail("usage: check-inactive-boundary.mjs --root <repository>");
  }
  return resolve(argv[1]);
}
function trackedPaths(root) {
  const result = spawnSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    fail(result.error?.message || result.stderr.trim() || "unable to read paths");
  }
  return result.stdout
    .split("\0")
    .filter((path) => path && existsSync(resolve(root, path)))
    .sort();
}
function verifyPaths(paths) {
  for (const path of paths) {
    if (path.split("/").some((part) => benchmarkDirectories.has(part))) {
      fail(`forbidden benchmark path: ${path}`);
    }
    if (!allowedPaths.has(path)) fail(`unapproved path: ${path}`);
  }
  for (const path of allowedPaths) {
    if (!paths.includes(path)) fail(`missing required path: ${path}`);
  }
}
function verifyPublicContracts(root) {
  for (const [path, status, absence] of publicContracts) {
    const content = readFileSync(resolve(root, path), "utf8");
    if (!content.includes(status)) fail(`missing public not_active status: ${path}`);
    if (!content.includes(absence)) fail(`missing public no-claim boundary: ${path}`);
  }
}

function normalizeMarkdownLine(line) {
  const trimmed = line.trim();
  const kind = /^#{1,6}(?:\s|$)/u.test(trimmed)
    ? "heading"
    : /^(?:[-+*]|\d+[.)])\s+/u.test(trimmed)
      ? "list"
      : "ordinary";
  const withoutMarker =
    kind === "heading"
      ? trimmed.replace(/^#{1,6}\s*/u, "")
      : kind === "list"
        ? trimmed.replace(/^(?:[-+*]|\d+[.)])\s+/u, "")
        : trimmed;
  return {
    kind,
    text: withoutMarker
      .replace(/[`*_]/gu, "")
      .replace(/\s+/gu, " ")
      .trim()
      .toLowerCase(),
  };
}
function isConcreteClaim({ kind, text }) {
  return (
    /^(?:task|dataset|metric|score|result|accuracy|leaderboard)\s*(?::|=)\s*\S/u.test(
      text,
    ) ||
    /^(?:repository\s+)?status\s*(?::|=|is)\s*active\b/u.test(text) ||
    (kind === "heading" &&
      /^(?:results?|leaderboard|scores?|metrics?|datasets?|tasks?)\b/u.test(text))
  );
}
function verifyNoConcreteClaims(root) {
  for (const path of publicDocuments) {
    const content = readFileSync(resolve(root, path), "utf8");
    for (const line of content.split(/\r?\n/u)) {
      if (isConcreteClaim(normalizeMarkdownLine(line))) {
        fail(`concrete benchmark claim: ${path}`);
      }
    }
  }
}

function main() {
  const root = parseRoot(process.argv.slice(2));
  const paths = trackedPaths(root);
  verifyPaths(paths);
  verifyPublicContracts(root);
  verifyNoConcreteClaims(root);
  process.stdout.write(
    `${JSON.stringify({ status: "passed", repository_status: "not_active", files: paths.length })}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

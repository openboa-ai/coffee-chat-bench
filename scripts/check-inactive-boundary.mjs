#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const requiredBaselinePaths = [
  "AGENTS.md",
  "README.md",
  "docs/quality-map.md",
  "docs/validity/activation-criteria.md",
  "scripts/check-inactive-boundary.mjs",
  "tests/inactive-boundary.test.mjs",
];
const repositoryControlFiles = new Set([
  ".gitattributes",
  ".gitignore",
  ".githooks/pre-commit",
  "AGENTS.md",
  "CODEOWNERS",
  "LICENSE",
  "README.md",
  "SECURITY.md",
]);
const projectToolingFiles = new Set([
  "package-lock.json",
  "package.json",
  "prettier.config.mjs",
  "tsconfig.json",
]);
const experimentalRoots = [
  "bank/",
  "config/",
  "docs/superpowers/",
  "docs/validity/",
  "harbor/",
  "perspectives/",
  "schemas/",
  "src/",
  "tests/",
];
const sddEvidencePath =
  /^\.superpowers\/sdd\/[^/]+\/(?:progress\.md|task-[A-Za-z0-9-]+-report\.md)$/u;
const forbiddenBenchmarkRoots = new Set([
  "cases",
  "candidates",
  "datasets",
  "eval",
  "metrics",
  "pilots",
  "results",
  "runners",
  "scorers",
  "tasks",
  "verifiers",
]);
const executableRoots = ["config/", "harbor/", "src/", "tests/"];
const publicContracts = [
  [
    "AGENTS.md",
    "status is `not_active`",
    "does not provide an active benchmark, measured results, a leaderboard, or Product-specific credit",
  ],
  [
    "README.md",
    "Repository status: `not_active`.",
    "does not provide an active benchmark, measured result, leaderboard, Product-specific credit, or validity claim",
  ],
];
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
    fail(
      result.error?.message || result.stderr.trim() || "unable to read paths",
    );
  }
  return result.stdout
    .split("\0")
    .filter((path) => path && existsSync(resolve(root, path)))
    .sort();
}
function roleFor(path) {
  if (repositoryControlFiles.has(path)) return "repository control";
  if (projectToolingFiles.has(path)) return "project tooling";
  if (path.startsWith(".github/")) return "repository automation";
  if (path === "docs/quality-map.md") return "quality governance";
  if (path === "scripts/check-inactive-boundary.mjs") return "boundary checker";
  if (sddEvidencePath.test(path)) return "SDD task evidence";
  if (experimentalRoots.some((root) => path.startsWith(root))) {
    return "experimental benchmark";
  }
  return undefined;
}
function experimentalArtifactClass(root, path) {
  if (!path.endsWith(".json")) return undefined;
  if (
    path.startsWith("tests/fixtures/") ||
    path.startsWith("bank/") ||
    path.startsWith("config/") ||
    path.startsWith("perspectives/")
  ) {
    let value;
    try {
      value = JSON.parse(readFileSync(resolve(root, path), "utf8"));
    } catch (error) {
      if (path.startsWith("tests/fixtures/")) return "fixture";
      throw error;
    }
    const artifactType = value?.artifact_type;
    const resultState = value?.result_state ?? value?.state ?? value?.status;
    if (
      [
        "benchmark_run",
        "benchmark_result",
        "measured_result",
        "leaderboard",
      ].includes(artifactType) ||
      resultState === "measured"
    ) {
      return "measured benchmark artifact";
    }
    if (path.startsWith("tests/fixtures/")) return "fixture";
    return path.startsWith("bank/") || path.startsWith("perspectives/")
      ? "source"
      : "configuration";
  }
  if (path.startsWith("schemas/") && path.endsWith(".schema.json")) {
    return "schema";
  }
  return "unclassified";
}
function verifyPaths(root, paths) {
  for (const path of paths) {
    if (forbiddenBenchmarkRoots.has(path.split("/")[0])) {
      fail(`forbidden benchmark path: ${path}`);
    }
    const role = roleFor(path);
    if (!role) fail(`unapproved path: ${path}`);
    if (role === "experimental benchmark") {
      const artifactClass = experimentalArtifactClass(root, path);
      if (artifactClass === "unclassified") {
        fail(`unclassified experimental JSON artifact: ${path}`);
      }
      if (artifactClass === "measured benchmark artifact") {
        fail(`forbidden measured benchmark artifact: ${path}`);
      }
    }
  }
  for (const path of requiredBaselinePaths) {
    if (!paths.includes(path)) fail(`missing required path: ${path}`);
  }
}
function verifyPublicContracts(root) {
  for (const [path, status, absence] of publicContracts) {
    const content = readFileSync(resolve(root, path), "utf8");
    if (!content.includes(status))
      fail(`missing public not_active status: ${path}`);
    if (!content.includes(absence))
      fail(`missing public no-claim boundary: ${path}`);
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
    /^(?:measured\s+)?results?\s*(?::|=)\s*\S/u.test(text) ||
    /^product(?:-specific)?\s+credit\s*(?::|=)\s*\S/u.test(text) ||
    /^(?:repository\s+)?status\s*(?::|=|is)\s*active\b/u.test(text) ||
    (kind === "heading" &&
      /^(?:results?|leaderboard|scores?|metrics?|datasets?)\b/u.test(text))
  );
}
function verifyNoConcreteClaims(root, paths) {
  for (const path of paths.filter((path) => path.endsWith(".md"))) {
    const content = readFileSync(resolve(root, path), "utf8");
    for (const line of content.split(/\r?\n/u)) {
      if (isConcreteClaim(normalizeMarkdownLine(line))) {
        fail(`concrete benchmark claim: ${path}`);
      }
    }
  }
}
function executableLanguage(path) {
  if (!executableRoots.some((root) => path.startsWith(root))) return undefined;
  if (/\.(?:[cm]?[jt]s|[jt]sx)$/u.test(path)) return "javascript";
  if (path.endsWith(".py")) return "python";
  return undefined;
}
function readQuotedString(source, start) {
  const quote = source[start];
  let value = "";
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      value += source[index + 1] || "";
      index += 2;
    } else if (source[index] === quote) {
      return { index: index + 1, value };
    } else {
      value += source[index];
      index += 1;
    }
  }
  return { index, value };
}
function javaScriptTokens(source) {
  const tokens = [];
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (/\s/u.test(character)) {
      index += 1;
    } else if (character === "/" && source[index + 1] === "/") {
      index = source.indexOf("\n", index + 2);
      if (index === -1) break;
    } else if (character === "/" && source[index + 1] === "*") {
      index = source.indexOf("*/", index + 2);
      if (index === -1) break;
      index += 2;
    } else if (['"', "'", "`"].includes(character)) {
      const string = readQuotedString(source, index);
      tokens.push({ kind: "string", value: string.value });
      index = string.index;
    } else if (/[A-Za-z_$]/u.test(character)) {
      let end = index + 1;
      while (/[A-Za-z0-9_$]/u.test(source[end] || "")) end += 1;
      tokens.push({ kind: "identifier", value: source.slice(index, end) });
      index = end;
    } else {
      tokens.push({ kind: "punctuation", value: character });
      index += 1;
    }
  }
  return tokens;
}
function javaScriptModuleSpecifiers(source) {
  const tokens = javaScriptTokens(source);
  const specifiers = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (token.value === "import" && next?.kind === "string") {
      specifiers.push(next.value);
    } else if (
      token.value === "import" &&
      next?.value === "(" &&
      tokens[index + 2]?.kind === "string"
    ) {
      specifiers.push(tokens[index + 2].value);
    } else if (
      token.value === "require" &&
      next?.value === "(" &&
      tokens[index + 2]?.kind === "string"
    ) {
      specifiers.push(tokens[index + 2].value);
    } else if (token.value === "import" || token.value === "export") {
      for (
        let cursor = index + 1;
        cursor < tokens.length && tokens[cursor].value !== ";";
        cursor += 1
      ) {
        if (
          tokens[cursor].value === "from" &&
          tokens[cursor + 1]?.kind === "string"
        ) {
          specifiers.push(tokens[cursor + 1].value);
          break;
        }
      }
    }
  }
  return specifiers;
}
function pythonTokens(source) {
  const tokens = [];
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (character === "\n") {
      tokens.push({ kind: "newline", value: "\n" });
      index += 1;
    } else if (/\s/u.test(character)) {
      index += 1;
    } else if (character === "#") {
      index = source.indexOf("\n", index + 1);
      if (index === -1) break;
    } else if (['"', "'"].includes(character)) {
      const triple = source.slice(index, index + 3) === character.repeat(3);
      if (triple) {
        const end = source.indexOf(character.repeat(3), index + 3);
        index = end === -1 ? source.length : end + 3;
      } else {
        const string = readQuotedString(source, index);
        tokens.push({ kind: "string", value: string.value });
        index = string.index;
      }
    } else if (/[A-Za-z_]/u.test(character)) {
      let end = index + 1;
      while (/[A-Za-z0-9_]/u.test(source[end] || "")) end += 1;
      tokens.push({ kind: "identifier", value: source.slice(index, end) });
      index = end;
    } else {
      tokens.push({ kind: "punctuation", value: character });
      index += 1;
    }
  }
  return tokens;
}
function pythonModuleSpecifiers(source) {
  const tokens = pythonTokens(source);
  const specifiers = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (
      tokens[index]?.value === "importlib" &&
      tokens[index + 1]?.value === "." &&
      tokens[index + 2]?.value === "import_module" &&
      tokens[index + 3]?.value === "(" &&
      tokens[index + 4]?.kind === "string"
    ) {
      specifiers.push(tokens[index + 4].value);
    }
    if (tokens[index]?.value === "from") {
      let cursor = index + 1;
      let specifier = "";
      while (
        tokens[cursor]?.value !== "import" &&
        tokens[cursor]?.kind !== "newline"
      ) {
        specifier += tokens[cursor]?.value || "";
        cursor += 1;
      }
      if (specifier) specifiers.push(specifier);
    }
    if (tokens[index]?.value === "import") {
      let cursor = index + 1;
      let expectingModule = true;
      while (tokens[cursor] && tokens[cursor].kind !== "newline") {
        if (tokens[cursor].value === ",") {
          expectingModule = true;
        } else if (tokens[cursor].value === "as") {
          expectingModule = false;
          cursor += 1;
        } else if (expectingModule && tokens[cursor].kind === "identifier") {
          let specifier = tokens[cursor].value;
          while (
            tokens[cursor + 1]?.value === "." &&
            tokens[cursor + 2]?.kind === "identifier"
          ) {
            specifier += `.${tokens[cursor + 2].value}`;
            cursor += 2;
          }
          specifiers.push(specifier);
          expectingModule = false;
        }
        cursor += 1;
      }
    }
  }
  return specifiers;
}
function isCandidateOrProductSpecifier(specifier) {
  return /(?:^|[./_-])candidate(?:$|[./_-])|coffee[-_]?chat/iu.test(specifier);
}
function verifyCandidateIndependence(root, paths) {
  for (const path of paths) {
    const language = executableLanguage(path);
    if (!language) continue;
    const content = readFileSync(resolve(root, path), "utf8");
    const specifiers =
      language === "javascript"
        ? javaScriptModuleSpecifiers(content)
        : pythonModuleSpecifiers(content);
    if (specifiers.some(isCandidateOrProductSpecifier)) {
      fail(`forbidden candidate or Product-specific import: ${path}`);
    }
  }
}

function main() {
  const root = parseRoot(process.argv.slice(2));
  const paths = trackedPaths(root);
  verifyPaths(root, paths);
  verifyPublicContracts(root);
  verifyNoConcreteClaims(root, paths);
  verifyCandidateIndependence(root, paths);
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

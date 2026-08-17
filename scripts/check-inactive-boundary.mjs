#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const requiredBaselinePaths = [
  "AGENTS.md",
  "README.md",
  "docs/benchmark-design.md",
  "docs/implementation-plan.md",
  "docs/quality-map.md",
  "docs/validity/validity-argument-and-evidence-plan.md",
  "qualification/PROTOCOL.md",
  "qualification/PRACTICE.md",
  "qualification/README.md",
  "qualification/study.json",
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
const publicBankEvidenceFiles = new Set([
  "CONTAMINATION.jsonl",
  "DATA-CARD.md",
  "OVERLAP-REPORT.json",
  "PREREGISTRATION.md",
  "RIGHTS-PROVENANCE.jsonl",
]);
const experimentalRoots = [
  "bank/",
  "docs/",
  "docs/validity/",
  "harbor/",
  "qualification/",
  "schemas/",
  "scripts/",
  "src/",
  "tests/",
];
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
const executableRoots = ["harbor/", "scripts/", "src/", "tests/"];
const publicContracts = [
  {
    path: "AGENTS.md",
    status: /status\s+is\s+`not_active`/iu,
    noClaim:
      /does not provide an active benchmark[\s\S]{0,240}measured results[\s\S]{0,240}leaderboard[\s\S]{0,240}Product-specific credit/iu,
  },
  {
    path: "README.md",
    status: /Repository status:\s*`not_active`/iu,
    noClaim:
      /does\s+not\s+establish\s+benchmark\s+validity[\s\S]{0,240}authentic-human\s+transfer[\s\S]{0,240}population\s+validity[\s\S]{0,240}product\s+performance/iu,
  },
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
function repositoryPaths(root) {
  const result = spawnSync(
    "git",
    [
      "-C",
      root,
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
    ],
    {
      encoding: "utf8",
    },
  );
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
  if (publicBankEvidenceFiles.has(path)) return "public bank evidence";
  if (path.startsWith(".github/")) return "repository automation";
  if (path === "docs/quality-map.md") return "quality governance";
  if (path === "scripts/check-inactive-boundary.mjs") return "boundary checker";
  if (experimentalRoots.some((root) => path.startsWith(root))) {
    return "experimental benchmark";
  }
  return undefined;
}
function experimentalArtifactClass(root, path) {
  if (!path.endsWith(".json")) return undefined;
  if (path === "docs/validity/activation-evidence.json") return "source";
  if (
    path.startsWith("tests/fixtures/") ||
    path.startsWith("bank/") ||
    path.startsWith("qualification/")
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
    return "source";
  }
  if (path.startsWith("schemas/") && path.endsWith(".schema.json")) {
    return "schema";
  }
  return "unclassified";
}
const forbiddenEvidenceKeys = new Set([
  "artifacttype",
  "benchmarkresult",
  "candidateresult",
  "leaderboard",
  "metric",
  "metrics",
  "result",
  "results",
  "resultstate",
  "score",
  "scores",
  "systemresult",
]);
const forbiddenEvidenceValues = new Set([
  "benchmarkrun",
  "benchmarkresult",
  "leaderboard",
  "measured",
  "measuredresult",
]);
function evidenceToken(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
}
function rejectResultEvidence(value, path) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      rejectResultEvidence(entry, `${path}[${index}]`),
    );
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (
      forbiddenEvidenceKeys.has(evidenceToken(key)) ||
      (typeof entry === "string" &&
        forbiddenEvidenceValues.has(evidenceToken(entry)))
    ) {
      fail(`invalid public bank evidence: ${path}.${key}`);
    }
    rejectResultEvidence(entry, `${path}.${key}`);
  }
}
function verifyPublicBankEvidence(root, path) {
  if (path === "DATA-CARD.md" || path === "PREREGISTRATION.md") return;
  let rows;
  try {
    const content = readFileSync(resolve(root, path), "utf8").trim();
    rows = path.endsWith(".jsonl")
      ? content.split("\n").map((line) => JSON.parse(line))
      : [JSON.parse(content)];
  } catch {
    fail(`invalid public bank evidence: ${path}`);
  }
  if (rows.length === 0) fail(`invalid public bank evidence: ${path}`);
  for (const [index, row] of rows.entries()) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      fail(`invalid public bank evidence: ${path}:${index + 1}`);
    }
    rejectResultEvidence(row, `${path}:${index + 1}`);
  }
}
function verifyPaths(root, paths) {
  for (const path of paths) {
    if (forbiddenBenchmarkRoots.has(path.split("/")[0])) {
      fail(`forbidden benchmark path: ${path}`);
    }
    const role = roleFor(path);
    if (!role) fail(`unapproved path: ${path}`);
    if (role === "public bank evidence") {
      verifyPublicBankEvidence(root, path);
    }
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
  for (const { path, status, noClaim } of publicContracts) {
    const content = readFileSync(resolve(root, path), "utf8");
    if (!status.test(content))
      fail(`missing public not_active status: ${path}`);
    if (!noClaim.test(content))
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
function javaScriptModuleSpecifiers(source, path) {
  const extension = path.split(".").at(-1);
  const scriptKind =
    extension === "tsx"
      ? ts.ScriptKind.TSX
      : extension === "jsx"
        ? ts.ScriptKind.JSX
        : ["ts", "mts", "cts"].includes(extension)
          ? ts.ScriptKind.TS
          : ts.ScriptKind.JS;
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const compilerOptions = { allowJs: true, noLib: true, noResolve: true };
  const compilerHost = ts.createCompilerHost(compilerOptions);
  compilerHost.fileExists = (fileName) => fileName === path;
  compilerHost.readFile = (fileName) =>
    fileName === path ? source : undefined;
  compilerHost.getSourceFile = (fileName) =>
    fileName === path ? sourceFile : undefined;
  const checker = ts
    .createProgram([path], compilerOptions, compilerHost)
    .getTypeChecker();
  const specifiers = [];
  let hasNonliteralDynamicImport = false;
  let hasCreateRequireCapability = false;
  let hasGlobalRequireCapability = false;
  const moduleSources = new Set(["module", "node:module"]);

  function literalModule(node) {
    return ts.isStringLiteralLike(node) ? node.text : undefined;
  }
  function isGlobalRequire(node) {
    const binding =
      ts.isIdentifier(node) && node.text === "require"
        ? checker.resolveName("require", node, ts.SymbolFlags.Value, true)
        : undefined;
    return (
      ts.isIdentifier(node) &&
      node.text === "require" &&
      !binding?.declarations?.length
    );
  }
  function isRequireCall(node) {
    return (
      ts.isCallExpression(node) &&
      isGlobalRequire(node.expression) &&
      !node.questionDotToken
    );
  }
  function isValueReference(node) {
    const parent = node.parent;
    if (ts.isExportSpecifier(parent)) {
      return (
        !parent.isTypeOnly &&
        !parent.parent.parent.isTypeOnly &&
        (parent.propertyName ?? parent.name) === node
      );
    }
    if (ts.isShorthandPropertyAssignment(parent)) return true;
    if (
      (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
      (ts.isBindingElement(parent) && parent.propertyName === node) ||
      ts.isImportClause(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isNamespaceExport(parent) ||
      (ts.isLabeledStatement(parent) && parent.label === node) ||
      ((ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) &&
        parent.label === node)
    ) {
      return false;
    }
    return !ts.isDeclarationName(node) && !ts.isPartOfTypeNode(node);
  }
  function capabilityBinding(name) {
    if (ts.isIdentifier(name)) return true;
    return name.elements.some((element) => {
      const imported = element.propertyName ?? element.name;
      return ts.isIdentifier(imported) && imported.text === "createRequire";
    });
  }
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      const specifier = literalModule(node.moduleSpecifier);
      if (specifier !== undefined) {
        specifiers.push(specifier);
        if (moduleSources.has(specifier)) {
          if (ts.isImportDeclaration(node)) {
            const clause = node.importClause;
            hasCreateRequireCapability ||= Boolean(
              clause?.name ||
              (clause?.namedBindings &&
                (ts.isNamespaceImport(clause.namedBindings) ||
                  clause.namedBindings.elements.some(
                    (element) =>
                      (element.propertyName ?? element.name).text ===
                      "createRequire",
                  ))),
            );
          } else {
            hasCreateRequireCapability ||=
              node.exportClause === undefined ||
              ts.isNamespaceExport(node.exportClause) ||
              node.exportClause.elements.some(
                (element) =>
                  (element.propertyName ?? element.name).text ===
                  "createRequire",
              );
          }
        }
      }
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression
    ) {
      const specifier = literalModule(node.moduleReference.expression);
      if (specifier !== undefined) {
        specifiers.push(specifier);
        hasCreateRequireCapability ||= moduleSources.has(specifier);
      }
    }
    if (ts.isCallExpression(node)) {
      const dynamicImport =
        node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const directRequire = isRequireCall(node);
      if (dynamicImport || directRequire) {
        const specifier = node.arguments[0]
          ? literalModule(node.arguments[0])
          : undefined;
        if (specifier === undefined) {
          hasNonliteralDynamicImport = true;
        } else {
          specifiers.push(specifier);
          if (dynamicImport && moduleSources.has(specifier)) {
            hasCreateRequireCapability = true;
          }
        }
      }
    }
    if (
      isGlobalRequire(node) &&
      isValueReference(node) &&
      !(ts.isCallExpression(node.parent) && isRequireCall(node.parent))
    ) {
      hasGlobalRequireCapability = true;
    }
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      isRequireCall(node.initializer)
    ) {
      const specifier = node.initializer.arguments[0]
        ? literalModule(node.initializer.arguments[0])
        : undefined;
      if (specifier !== undefined && moduleSources.has(specifier)) {
        hasCreateRequireCapability ||= capabilityBinding(node.name);
      }
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "createRequire" &&
      isRequireCall(node.expression)
    ) {
      const specifier = node.expression.arguments[0]
        ? literalModule(node.expression.arguments[0])
        : undefined;
      hasCreateRequireCapability ||=
        specifier !== undefined && moduleSources.has(specifier);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return {
    hasCreateRequireCapability,
    hasGlobalRequireCapability,
    hasNonliteralDynamicImport,
    specifiers,
  };
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
  let hasNonliteralDynamicImport = false;
  let hasDynamicLoaderImport = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const importlibCall =
      tokens[index]?.value === "importlib" &&
      tokens[index + 1]?.value === "." &&
      tokens[index + 2]?.value === "import_module" &&
      tokens[index + 3]?.value === "(";
    const dunderCall =
      tokens[index]?.value === "__import__" && tokens[index + 1]?.value === "(";
    const importModuleCall =
      tokens[index]?.value === "import_module" &&
      tokens[index + 1]?.value === "(";
    if (importlibCall || dunderCall || importModuleCall) {
      hasDynamicLoaderImport = true;
      const argumentIndex = index + (importlibCall ? 4 : 2);
      const argument = tokens[argumentIndex];
      const separator = tokens[argumentIndex + 1];
      if (
        argument?.kind === "string" &&
        [")", ","].includes(separator?.value)
      ) {
        specifiers.push(argument.value);
      } else {
        hasNonliteralDynamicImport = true;
      }
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
  if (
    specifiers.some((specifier) =>
      ["importlib", "import_module", "builtins", "__import__"].includes(
        specifier,
      ),
    )
  ) {
    hasDynamicLoaderImport = true;
  }
  return {
    hasDynamicLoaderImport,
    hasNonliteralDynamicImport,
    specifiers,
  };
}
function isCandidateOrProductSpecifier(specifier) {
  if (specifier === "@openboa-ai/coffee-chat-bench") return false;
  return /(?:^|[./_-])candidate(?:$|[./_-])|coffee[-_]?chat/iu.test(specifier);
}
function verifyCandidateIndependence(root, paths) {
  for (const path of paths) {
    const language = executableLanguage(path);
    if (!language) continue;
    const content = readFileSync(resolve(root, path), "utf8");
    const imports =
      language === "javascript"
        ? javaScriptModuleSpecifiers(content, path)
        : pythonModuleSpecifiers(content);
    if (imports.hasNonliteralDynamicImport) {
      fail(`nonliteral dynamic import: ${path}`);
    }
    if (imports.specifiers.some(isCandidateOrProductSpecifier)) {
      fail(`forbidden candidate or Product-specific import: ${path}`);
    }
    if (imports.hasCreateRequireCapability) {
      fail(`forbidden createRequire capability: ${path}`);
    }
    if (imports.hasGlobalRequireCapability) {
      fail(`forbidden global require capability: ${path}`);
    }
    if (imports.hasDynamicLoaderImport) {
      fail(`forbidden Python dynamic loader: ${path}`);
    }
  }
}

function main() {
  const root = parseRoot(process.argv.slice(2));
  const paths = repositoryPaths(root);
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

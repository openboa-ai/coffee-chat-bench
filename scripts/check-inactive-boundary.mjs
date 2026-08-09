#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { parsers } from "prettier/plugins/babel";

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
const controlModuleContracts = new Map([
  [".github/ci-policy.mjs", "closed"],
  ["prettier.config.mjs", "static-default-object"],
  ["scripts/check-inactive-boundary.mjs", "closed"],
  ["scripts/check-migration-receipt.mjs", "closed"],
  ["tests/governance-policy.test.mjs", "closed"],
  ["tests/inactive-boundary.test.mjs", "closed"],
]);
const activationCriteriaPath = "docs/validity/activation-criteria.md";
const forbiddenActivationContent =
  /\b(?:tasks?|cases?|metrics?|datasets?|scores?|results?)\b/iu;
const forbiddenExecutableContent =
  /\b(?:export\s+)?(?:const|let|var|function|class)\s+(?:tasks?|datasets?|cases?|metrics?|scores?|scorers?|verifiers?|runners?|pilots?|candidates?)\b|\b(?:tasks?|datasets?|cases?|metrics?|scores?|scorers?|verifiers?|runners?|pilots?|candidates?)\s*[:=]\s*(?:\{|\[|\(?[^;\n]*=>|function\b)/iu;

function fail(message) {
  throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseControlModule(path, source) {
  try {
    // @ts-expect-error Prettier's plugin type exposes full formatter options,
    // while its runtime parser accepts the filepath-only parse context used here.
    const parsed = parsers.babel.parse(source, { filepath: path });
    if (
      parsed instanceof Promise ||
      parsed?.type !== "File" ||
      parsed.program?.type !== "Program" ||
      !Array.isArray(parsed.program.body)
    ) {
      fail(`control module parser contract unavailable: ${path}`);
    }
    return parsed.program;
  } catch (error) {
    fail(
      `invalid control module syntax: ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const astMetadataKeys = new Set([
  "comments",
  "end",
  "errors",
  "extra",
  "loc",
  "start",
  "tokens",
]);

function visitAst(value, visitor, ancestors = []) {
  if (!value || typeof value !== "object") return;
  if (typeof value.type === "string") visitor(value, ancestors);
  for (const [key, child] of Object.entries(value)) {
    if (astMetadataKeys.has(key)) continue;
    const children = Array.isArray(child) ? child : [child];
    for (const entry of children) {
      if (!entry || typeof entry !== "object") continue;
      visitAst(entry, visitor, [...ancestors, { node: value, key }]);
    }
  }
}

function failClosedModule(path, detail) {
  fail(`closed control module executable boundary: ${path}: ${detail}`);
}

function importedBindings(program, source, importedName) {
  const bindings = new Set();
  for (const statement of program.body) {
    if (
      statement.type !== "ImportDeclaration" ||
      statement.source.value !== source
    ) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (
        (importedName === "default" &&
          specifier.type === "ImportDefaultSpecifier") ||
        (specifier.type === "ImportSpecifier" &&
          specifier.imported?.name === importedName)
      ) {
        bindings.add(specifier.local.name);
      }
    }
  }
  return bindings;
}

function hasControlExecutionOwner(ancestors, testBindings) {
  return ancestors.some(
    ({ node }) =>
      node.type === "FunctionDeclaration" ||
      node.type === "TryStatement" ||
      (node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        testBindings.has(node.callee.name)),
  );
}

function isControlCallback(ancestors, copyBindings, testBindings) {
  if (!hasControlExecutionOwner(ancestors, testBindings)) return false;
  let copyFilter = false;
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const { node, key } = ancestors[index];
    if (node.type === "CallExpression" || node.type === "NewExpression") {
      if (key !== "arguments") return false;
      if (!copyFilter) return true;
      return (
        node.callee.type === "Identifier" && copyBindings.has(node.callee.name)
      );
    }
    if (node.type === "ObjectProperty" && key === "value") {
      const propertyName =
        node.key.type === "Identifier" ? node.key.name : node.key.value;
      if (propertyName !== "filter") return false;
      copyFilter = true;
      continue;
    }
    if (
      (node.type === "ObjectExpression" && key === "properties") ||
      (node.type === "SpreadElement" && key === "argument")
    ) {
      continue;
    }
    return false;
  }
  return false;
}

function isControlFunctionUse(ancestors) {
  const relation = ancestors.at(-1);
  if (!relation) return false;
  const { node, key } = relation;
  return (
    ((node.type === "CallExpression" || node.type === "NewExpression") &&
      (key === "callee" || key === "arguments")) ||
    (node.type === "TaggedTemplateExpression" && key === "tag")
  );
}

function controlFunctionReferences(value, names) {
  const references = new Set();
  visitAst(value, (node, ancestors) => {
    if (
      node.type === "Identifier" &&
      names.has(node.name) &&
      isControlFunctionUse(ancestors)
    ) {
      references.add(node.name);
    }
  });
  return references;
}

function isTestRegistration(statement, testBindings) {
  return (
    statement.type === "ExpressionStatement" &&
    statement.expression.type === "CallExpression" &&
    statement.expression.callee.type === "Identifier" &&
    testBindings.has(statement.expression.callee.name)
  );
}

function verifyClosedControlModule(path, program) {
  const testModule = path.startsWith("tests/");
  const testBindings = importedBindings(program, "node:test", "default");
  const copyBindings = importedBindings(program, "node:fs", "cpSync");
  const functions = new Map();
  let entrypoints = 0;

  for (const statement of program.body) {
    if (
      [
        "ExportAllDeclaration",
        "ExportDefaultDeclaration",
        "ExportNamedDeclaration",
      ].includes(statement.type)
    ) {
      fail(`closed control module export: ${path}`);
    }
    if (statement.type === "FunctionDeclaration") {
      if (!statement.id || statement.async || statement.generator) {
        failClosedModule(path, "unsupported top-level control function");
      }
      functions.set(statement.id.name, statement);
      continue;
    }
    if (
      statement.type === "ImportDeclaration" ||
      statement.type === "VariableDeclaration"
    ) {
      continue;
    }
    if (!testModule && statement.type === "TryStatement") {
      entrypoints += 1;
      continue;
    }
    if (testModule && isTestRegistration(statement, testBindings)) continue;
    failClosedModule(path, `unsupported top-level ${statement.type}`);
  }
  if (!testModule && entrypoints !== 1) {
    failClosedModule(path, "expected exactly one control entrypoint");
  }

  visitAst(program, (node, ancestors) => {
    if (node.type === "FunctionDeclaration") {
      const parent = ancestors.at(-1)?.node;
      if (parent?.type !== "Program") {
        failClosedModule(path, "nested function declaration");
      }
      return;
    }
    if (node.type === "ArrowFunctionExpression") {
      if (
        node.async ||
        !isControlCallback(ancestors, copyBindings, testBindings)
      ) {
        failClosedModule(path, "callable outside an approved callback role");
      }
      return;
    }
    if (
      [
        "ClassDeclaration",
        "ClassExpression",
        "ClassMethod",
        "ClassPrivateMethod",
        "FunctionExpression",
        "ObjectMethod",
      ].includes(node.type)
    ) {
      failClosedModule(path, `unsupported callable ${node.type}`);
    }
  });

  const names = new Set(functions.keys());
  const roots = new Set();
  for (const statement of program.body) {
    const controlEntrypoint = testModule
      ? isTestRegistration(statement, testBindings)
      : statement.type === "TryStatement";
    if (!controlEntrypoint) continue;
    for (const name of controlFunctionReferences(statement, names)) {
      roots.add(name);
    }
  }
  const reachable = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const name = pending.pop();
    if (reachable.has(name)) continue;
    reachable.add(name);
    const declaration = functions.get(name);
    if (!declaration) continue;
    for (const dependency of controlFunctionReferences(
      declaration.body,
      names,
    )) {
      pending.push(dependency);
    }
  }
  for (const name of names) {
    if (!reachable.has(name)) {
      failClosedModule(path, "unreachable local control function");
    }
  }
}

function isStaticDefaultObject(statement) {
  if (
    statement?.type !== "ExportDefaultDeclaration" ||
    statement.declaration?.type !== "ObjectExpression"
  ) {
    return false;
  }
  return statement.declaration.properties.every(
    (property) =>
      property.type === "ObjectProperty" &&
      property.computed === false &&
      property.method === false &&
      property.shorthand === false &&
      [
        "BooleanLiteral",
        "NullLiteral",
        "NumericLiteral",
        "StringLiteral",
      ].includes(property.value.type),
  );
}

function verifyControlModuleStructure(root, paths) {
  const modulePaths = paths.filter((path) => path.endsWith(".mjs")).sort();
  const declaredPaths = [...controlModuleContracts.keys()].sort();
  if (JSON.stringify(modulePaths) !== JSON.stringify(declaredPaths)) {
    fail("control module contract path mismatch");
  }

  for (const path of modulePaths) {
    const program = parseControlModule(
      path,
      readFileSync(resolve(root, path), "utf8"),
    );
    const contract = controlModuleContracts.get(path);
    if (contract === "closed") {
      verifyClosedControlModule(path, program);
      continue;
    }
    if (program.body.length !== 1 || !isStaticDefaultObject(program.body[0])) {
      fail(`non-static control module export: ${path}`);
    }
  }
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
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || result.stderr.trim() || "unknown";
    fail(`tracked-path evidence unavailable: ${detail}`);
  }
  return result.stdout.split("\0").filter(Boolean);
}

function isExecutableControlPath(path) {
  return (
    path === "package.json" ||
    path.endsWith(".mjs") ||
    path.startsWith(".github/workflows/")
  );
}

function verifyExecutableControlSurface(root, paths) {
  const policy = JSON.parse(
    readFileSync(resolve(root, ".github/merge-policy.json"), "utf8"),
  );
  const declared = policy.inactive_control_surface;
  if (!declared || typeof declared !== "object" || Array.isArray(declared)) {
    fail("executable control surface declaration unavailable");
  }
  const actualPaths = paths.filter(isExecutableControlPath).sort();
  const declaredPaths = Object.keys(declared).sort();
  if (JSON.stringify(actualPaths) !== JSON.stringify(declaredPaths)) {
    fail("executable control surface path mismatch");
  }
  for (const path of actualPaths) {
    const expected = declared[path];
    if (!/^[0-9a-f]{64}$/u.test(expected)) {
      fail(`invalid executable control surface digest: ${path}`);
    }
    if (sha256(readFileSync(resolve(root, path))) !== expected) {
      fail(`executable control surface digest mismatch: ${path}`);
    }
  }
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
  verifyControlModuleStructure(root, paths);
  verifyExecutableControlSurface(root, paths);

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

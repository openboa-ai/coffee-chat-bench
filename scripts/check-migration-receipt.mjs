#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Ajv } from "ajv";

const paths = {
  projection:
    "docs/migration/selections/task-4-inactive-benchmark-trust-base.json",
  equality: "docs/migration/equality/task-4-inactive-benchmark-trust-base.json",
  receipt: "docs/migration/receipts/task-4-inactive-benchmark-trust-base.json",
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function fail(message) {
  throw new Error(message);
}

function validate(validator, value, label) {
  if (validator(value)) return;
  const details = (validator.errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
  fail(`${label} schema validation failed: ${details}`);
}

function readJson(root, path) {
  const bytes = readFileSync(resolve(root, path));
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index] || !argv[index + 1] || values.has(argv[index])) {
      throw new Error("arguments must be unique flag/value pairs");
    }
    values.set(argv[index], argv[index + 1]);
  }
  if (!values.has("--root") || !values.has("--base")) {
    throw new Error("--root and --base are required");
  }
  return {
    root: resolve(values.get("--root")),
    base: values.get("--base"),
    target: values.get("--target"),
  };
}

function git(root, arguments_) {
  return execFileSync("git", ["-C", root, ...arguments_], {
    encoding: "utf8",
  }).trim();
}

function gitPaths(root, base, target) {
  const changed = target
    ? git(root, [
        "diff",
        "--name-only",
        "--diff-filter=ACMRD",
        base,
        target,
        "--",
      ])
    : git(root, ["diff", "--name-only", "--diff-filter=ACMRD", base, "--"]);
  const untracked = target
    ? ""
    : git(root, ["ls-files", "--others", "--exclude-standard"]);
  return [
    ...new Set(
      `${changed}\n${untracked}`
        .split("\n")
        .filter(
          (path) =>
            path &&
            path !== "node_modules" &&
            !path.startsWith("node_modules/"),
        ),
    ),
  ].sort();
}

function identityKey(row) {
  return `${row.source_repository}\u0000${row.source_ref}\u0000${row.source_commit}\u0000${row.source_path}`;
}

function identities(rows) {
  return rows.map(identityKey);
}

function exactArray(actual, expected, label) {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    fail(
      `${label} mismatch\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`,
    );
  }
}

function assertSchemaShape(value, expectedSchema, label) {
  assert.equal(value.schema, expectedSchema, `${label}: schema`);
  assert.equal(
    value.target_owner,
    "openboa-ai/coffee-chat-bench",
    `${label}: owner`,
  );
  assert.equal(value.task, "task-4", `${label}: task`);
  assert.equal(
    value.objective,
    "inactive-benchmark-trust-base",
    `${label}: objective`,
  );
}

async function fetchPinnedSource(row) {
  const encodedPath = row.source_path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const url =
    `https://api.github.com/repos/${row.source_repository}/contents/` +
    `${encodedPath}?ref=${encodeURIComponent(row.source_commit)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "openboa-ai-coffee-chat-bench-migration-check",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    fail(`pinned source fetch failed: HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (
    !payload ||
    Array.isArray(payload) ||
    payload.type !== "file" ||
    payload.encoding !== "base64" ||
    typeof payload.content !== "string"
  ) {
    fail("pinned source response is not one base64 file");
  }
  if (payload.sha !== row.source_blob_oid) {
    fail(`pinned source blob mismatch for ${row.source_path}`);
  }
  return Buffer.from(payload.content.replace(/\s/gu, ""), "base64");
}

async function verifyMigrateEvidence(root, rows, evidence) {
  const byIdentity = new Map(
    evidence.map((entry) => [identityKey(entry), entry]),
  );
  assert.equal(byIdentity.size, evidence.length, "migrate evidence identity");
  assert.equal(rows.length, evidence.length, "migrate evidence cardinality");
  for (const row of rows) {
    const entry = byIdentity.get(identityKey(row));
    assert.ok(entry, `missing migrate evidence: ${row.source_path}`);
    assert.equal(entry.status, "passed", `migrate status: ${row.source_path}`);
    assert.equal(entry.target_path, row.target_path_or_surface);
    assert.equal(entry.source_sha256, row.content_sha256);
    if (entry.source_blob_oid !== row.source_blob_oid) {
      fail(`source blob mismatch: ${row.source_path}`);
    }
    const sourceBytes = await fetchPinnedSource(row);
    assert.equal(
      sha256(sourceBytes),
      row.content_sha256,
      `pinned source digest: ${row.source_path}`,
    );
    assert.equal(
      sha256(readFileSync(resolve(root, entry.target_path))),
      entry.target_sha256,
    );
    assert.equal(entry.target_sha256, entry.source_sha256);
  }
}

function verifyRewriteEvidence(rows, evidence) {
  assert.equal(rows.length, evidence.length, "rewrite evidence cardinality");
  for (const row of rows) {
    const entry = evidence.find(
      (value) => value.source_path === row.source_path,
    );
    assert.ok(entry, `missing rewrite evidence: ${row.source_path}`);
    assert.equal(entry.status, "passed", `rewrite status: ${row.source_path}`);
    for (const field of [
      "rationale_code",
      "oracle_code",
      "source_objective_or_failure_mode",
      "replacement_observable_oracle",
    ]) {
      assert.equal(entry[field], row[field], `${row.source_path}: ${field}`);
    }
    assert.ok(
      entry.evidence.includes("command:inactive:check"),
      row.source_path,
    );
  }
}

function assertReviewedAuthority(projection, equality, receipt, policy) {
  const authority = policy.migration?.reviewed_authority;
  if (!authority || typeof authority !== "object" || Array.isArray(authority)) {
    fail("reviewed migration authority is unavailable");
  }
  const expectedFields = [
    "target_owner",
    "task",
    "objective",
    "ledger_sha256",
    "generator_sha256",
    "objective_selection_sha256",
    "projection_sha256",
    "changed_surface_classification_sha256",
    "equality_receipt_sha256",
    "execution_identity_receipt_sha256",
    "target_bootstrap_receipt_sha256",
    "changed_surfaces_sha256",
    "selected_rows",
    "changed_surfaces",
  ];
  exactArray(
    Object.keys(authority).sort(),
    [...expectedFields].sort(),
    "reviewed migration authority fields",
  );
  const actual = {
    target_owner: projection.value.target_owner,
    task: projection.value.task,
    objective: projection.value.objective,
    ledger_sha256: projection.value.ledger_sha256,
    generator_sha256: equality.value.generator_sha256,
    objective_selection_sha256: equality.value.objective_selection_sha256,
    projection_sha256: sha256(projection.bytes),
    changed_surface_classification_sha256:
      equality.value.changed_surface_classification_sha256,
    equality_receipt_sha256: sha256(equality.bytes),
    execution_identity_receipt_sha256:
      receipt.value.execution_identity_receipt_sha256,
    target_bootstrap_receipt_sha256:
      receipt.value.target_bootstrap_receipt_sha256,
    changed_surfaces_sha256: receipt.value.changed_surfaces_sha256,
    selected_rows: projection.value.selected_rows.length,
    changed_surfaces: projection.value.changed_surface_classification.length,
  };
  for (const [field, value] of Object.entries(actual)) {
    if (authority[field] !== value) {
      fail(`reviewed migration authority mismatch: ${field}`);
    }
  }
}

function runOracle(root) {
  const result = spawnSync("npm", ["run", "inactive:check"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const projection = readJson(args.root, paths.projection);
  const equality = readJson(args.root, paths.equality);
  const receipt = readJson(args.root, paths.receipt);
  const policy = readJson(args.root, ".github/merge-policy.json").value;

  const ajv = new Ajv({ allErrors: true, strict: true });
  for (const [path, value, label] of [
    [".github/migration-selection.schema.json", projection.value, "projection"],
    [
      ".github/migration-equality-receipt.schema.json",
      equality.value,
      "equality receipt",
    ],
    [".github/migration-receipt.schema.json", receipt.value, "target receipt"],
  ]) {
    validate(ajv.compile(readJson(args.root, path).value), value, label);
  }

  assertSchemaShape(
    projection.value,
    "coffee-chat/migration-selection-projection",
    "projection",
  );
  assertSchemaShape(
    equality.value,
    "coffee-chat/migration-equality-inputs",
    "equality",
  );
  assertSchemaShape(receipt.value, "coffee-chat/migration-receipt", "receipt");
  assertReviewedAuthority(projection, equality, receipt, policy);
  for (const field of ["target_owner", "task", "objective", "ledger_sha256"]) {
    assert.equal(
      equality.value[field],
      projection.value[field],
      `projection/equality ${field}`,
    );
  }
  for (const field of ["target_owner", "task", "objective"]) {
    assert.equal(
      receipt.value[field],
      projection.value[field],
      `projection/receipt ${field}`,
    );
  }
  assert.equal(equality.value.projection_sha256, sha256(projection.bytes));
  assert.equal(receipt.value.projection_sha256, sha256(projection.bytes));
  assert.equal(receipt.value.equality_receipt_sha256, sha256(equality.bytes));

  const classification = projection.value.changed_surface_classification;
  const expectedPaths = classification
    .map((entry) => entry.target_path_or_surface)
    .sort();
  assert.equal(
    new Set(expectedPaths).size,
    expectedPaths.length,
    "duplicate classified surface",
  );
  const actualPaths = gitPaths(args.root, args.base, args.target);
  assert.deepEqual(actualPaths, expectedPaths, "exact changed surface");
  assert.deepEqual(
    receipt.value.changed_surfaces,
    expectedPaths,
    "receipt changed surface",
  );
  assert.equal(
    receipt.value.changed_surfaces_sha256,
    sha256(canonicalJson(expectedPaths)),
  );
  assert.equal(receipt.value.base_commit, args.base);
  assert.equal(
    receipt.value.empty_base_tree,
    "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
  );

  const expectedClassificationDigest = sha256(
    canonicalJson({
      target_owner: projection.value.target_owner,
      task: projection.value.task,
      objective: projection.value.objective,
      changed_surface_classification: classification,
    }),
  );
  assert.equal(
    equality.value.changed_surface_classification_sha256,
    expectedClassificationDigest,
  );

  const selected = identities(projection.value.selected_rows);
  const classified = classification
    .filter((entry) => entry.classification === "ledger-derived")
    .flatMap((entry) => identities(entry.selected_rows));
  assert.deepEqual(
    [...new Set(classified)].sort(),
    [...new Set(selected)].sort(),
  );

  const migration = policy.migration;
  assert.equal(migration.base_commit, args.base);
  assert.equal(migration.trust_base_source, "checked_head");
  assert.equal(migration.trust_base_commit, undefined);
  if (process.env.MIGRATION_TARGET_SHA !== undefined) {
    assert.equal(
      args.target,
      process.env.MIGRATION_TARGET_SHA,
      "--target must match the checked workflow head",
    );
  }
  assert.equal(
    git(args.root, ["rev-parse", `${args.base}^{commit}`]),
    args.base,
  );
  assert.equal(
    git(args.root, ["show", "-s", "--format=%P", args.base]),
    "",
    "migration base must be a root commit",
  );
  assert.equal(
    git(args.root, ["rev-parse", `${args.base}^{tree}`]),
    "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
    "migration base must be the empty tree",
  );
  if (args.target) {
    assert.equal(
      git(args.root, ["rev-parse", `${args.target}^{commit}`]),
      args.target,
    );
    const commits = git(args.root, [
      "rev-list",
      "--parents",
      "--reverse",
      `${args.base}..${args.target}`,
    ])
      .split("\n")
      .filter(Boolean);
    assert.ok(
      commits.length > 0,
      "trust-base target must advance the empty base",
    );
    let expectedParent = args.base;
    for (const entry of commits) {
      const [commit, ...parents] = entry.split(" ");
      assert.deepEqual(
        parents,
        [expectedParent],
        "trust-base history must be linear and rooted at the empty base",
      );
      expectedParent = commit;
    }
    assert.equal(expectedParent, args.target, "trust-base head mismatch");
  }
  assert.equal(
    git(args.root, ["show", "-s", "--format=%an", args.base]),
    "SonSangjoon",
    "empty base author",
  );
  assert.equal(
    git(args.root, ["show", "-s", "--format=%ae", args.base]),
    "74908906+SonSangjoon@users.noreply.github.com",
    "empty base author email",
  );
  assert.equal(
    git(args.root, ["show", "-s", "--format=%cn", args.base]),
    "SonSangjoon",
    "empty base committer",
  );
  assert.equal(
    git(args.root, ["show", "-s", "--format=%ce", args.base]),
    "74908906+SonSangjoon@users.noreply.github.com",
    "empty base committer email",
  );

  await verifyMigrateEvidence(
    args.root,
    projection.value.selected_rows.filter((row) => row.action === "migrate"),
    receipt.value.migrate_evidence,
  );
  verifyRewriteEvidence(
    projection.value.selected_rows.filter((row) => row.action === "rewrite"),
    receipt.value.rewrite_evidence,
  );
  assert.deepEqual(receipt.value.exclude_evidence, []);
  assert.equal(receipt.value.verification.local_deterministic, "passed");
  runOracle(args.root);

  process.stdout.write(
    `${JSON.stringify({ status: "passed", target_commit: args.target ?? null, changed_surfaces: expectedPaths.length })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});

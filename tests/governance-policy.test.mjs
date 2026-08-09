import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const emptyBase = "50e4887218de9d1856bbc13afd632bc6eddf08c7";
const localTrustBase = "45c1fb39d06e8de94afa1d63b22768fb66fbe6c3";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "bench-policy-"));
  const repository = join(directory, "repository");
  cpSync(root, repository, {
    recursive: true,
    filter: (path) => !path.split("/").includes("node_modules"),
  });
  symlinkSync(join(root, "node_modules"), join(repository, "node_modules"));
  return { directory, repository };
}

function runMigration(repository) {
  return spawnSync(
    process.execPath,
    [
      join(repository, "scripts", "check-migration-receipt.mjs"),
      "--root",
      repository,
      "--base",
      emptyBase,
      "--target",
      localTrustBase,
    ],
    { encoding: "utf8" },
  );
}

test("governance policy accepts the inactive benchmark trust base", () => {
  const result = spawnSync(process.execPath, [".github/ci-policy.mjs"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("migration policy derives the immutable target from the checked head", () => {
  const policy = JSON.parse(
    readFileSync(join(root, ".github", "merge-policy.json"), "utf8"),
  );
  assert.equal(policy.migration.trust_base_source, "checked_head");
  assert.equal(policy.migration.trust_base_commit, undefined);
});

test("migration checker rejects a modified reviewed workspace ledger authority", () => {
  const temp = fixture();
  try {
    const projectionPath = join(
      temp.repository,
      "docs",
      "migration",
      "selections",
      "task-4-inactive-benchmark-trust-base.json",
    );
    const projection = JSON.parse(readFileSync(projectionPath, "utf8"));
    projection.ledger_sha256 = "0".repeat(64);
    writeFileSync(projectionPath, `${JSON.stringify(projection, null, 2)}\n`);

    const result = runMigration(temp.repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /reviewed migration authority/i);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
});

test("migration checker rejects a migrate receipt with a different pinned blob", () => {
  const temp = fixture();
  try {
    const receiptPath = join(
      temp.repository,
      "docs",
      "migration",
      "receipts",
      "task-4-inactive-benchmark-trust-base.json",
    );
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    receipt.migrate_evidence[0].source_blob_oid = "0".repeat(40);
    writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

    const result = runMigration(temp.repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /source blob/i);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
});

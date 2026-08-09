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

import { parse } from "yaml";

const root = resolve(import.meta.dirname, "..");
const emptyBase = "50e4887218de9d1856bbc13afd632bc6eddf08c7";

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

function noNetworkEnvironment(directory) {
  const importPath = join(directory, "forbid-network.mjs");
  writeFileSync(
    importPath,
    'globalThis.fetch = () => { throw new Error("network access forbidden in deterministic Bench tests"); };\n',
  );
  return {
    ...process.env,
    NODE_OPTIONS: `--import=${importPath}`,
  };
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
    ],
    {
      encoding: "utf8",
      env: noNetworkEnvironment(resolve(repository, "..")),
    },
  );
}

test("governance policy accepts the inactive benchmark trust base", () => {
  const directory = mkdtempSync(join(tmpdir(), "bench-no-network-"));
  try {
    const result = spawnSync(process.execPath, [".github/ci-policy.mjs"], {
      cwd: root,
      encoding: "utf8",
      env: noNetworkEnvironment(directory),
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("migration checker validates frozen source identity without network", () => {
  const temp = fixture();
  try {
    const result = runMigration(temp.repository);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
});

test("migration policy derives the immutable target from the checked head", () => {
  const policy = JSON.parse(
    readFileSync(join(root, ".github", "merge-policy.json"), "utf8"),
  );
  assert.equal(policy.migration.trust_base_source, "checked_head");
  assert.equal(policy.migration.trust_base_commit, undefined);
});

test("coverage CI uploads same-repository Cobertura evidence to GitHub", () => {
  const workflow = readFileSync(
    join(root, ".github", "workflows", "github-coverage.yml"),
    "utf8",
  );
  const document = parse(workflow);
  const authorGate = document.jobs.coverage.steps[0];

  assert.equal(authorGate.name, "Verify trusted pull request author");
  assert.equal(authorGate.if, "github.event_name == 'pull_request'");
  assert.deepEqual(authorGate.env, {
    AUTHOR_ASSOCIATION: "${{ github.event.pull_request.author_association }}",
    AUTHOR_LOGIN: "${{ github.event.pull_request.user.login }}",
  });
  for (const scenario of [
    { association: "OWNER", login: "outside", accepted: true },
    { association: "MEMBER", login: "outside", accepted: true },
    { association: "NONE", login: "openboa", accepted: true },
    { association: "CONTRIBUTOR", login: "outside", accepted: false },
  ]) {
    const result = spawnSync("bash", ["-c", authorGate.run], {
      encoding: "utf8",
      env: {
        ...process.env,
        AUTHOR_ASSOCIATION: scenario.association,
        AUTHOR_LOGIN: scenario.login,
      },
    });
    assert.equal(result.status === 0, scenario.accepted, scenario.login);
  }

  assert.match(workflow, /^name: Bench code coverage$/mu);
  assert.match(workflow, /pull_request:/u);
  assert.match(workflow, /merge_group:/u);
  assert.match(workflow, /--experimental-test-coverage/u);
  assert.match(workflow, /runner\.temp/u);
  assert.match(workflow, /RUNNER_TEMP/u);
  assert.match(workflow, /cobertura\.xml/u);
  assert.match(
    workflow,
    /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/u,
  );
  assert.match(workflow, /code-quality: write/u);
  assert.match(workflow, /actions\/upload-code-coverage@[0-9a-f]{40}/u);
  assert.match(workflow, /label: bench-javascript/u);
});

test("the required aggregate validates the exact immutable head without a duplicate policy job", () => {
  const quality = parse(
    readFileSync(join(root, ".github", "workflows", "quality.yml"), "utf8"),
  );
  const policy = parse(
    readFileSync(join(root, ".github", "workflows", "policy.yml"), "utf8"),
  );
  const expectedHead =
    "${{ github.event.pull_request.head.sha || github.event.merge_group.head_sha || github.sha }}";
  const checkout = quality.jobs.quality.steps.find((step) =>
    String(step.uses).startsWith("actions/checkout@"),
  );
  const verification = quality.jobs.quality.steps.find(
    (step) => step.run === "npm run ci:policy",
  );

  assert.equal(checkout.with.ref, expectedHead);
  assert.equal(verification.env.MIGRATION_TARGET_SHA, expectedHead);
  assert.equal(policy.jobs.policy, undefined);
  assert.ok(policy.jobs["dependency-review"]);
});

test("quality configuration is included in the protected control surface", () => {
  const policy = JSON.parse(
    readFileSync(join(root, ".github", "merge-policy.json"), "utf8"),
  );
  const codeowners = readFileSync(join(root, "CODEOWNERS"), "utf8");

  for (const path of [
    "/.editorconfig",
    "/prettier.config.mjs",
    "/tsconfig.json",
  ]) {
    assert.ok(policy.protected_paths.includes(path), path);
    assert.match(codeowners, new RegExp(`^${path}\\s+@openboa$`, "mu"), path);
  }
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

test("migration checker rejects migrated target-byte tampering", () => {
  const temp = fixture();
  try {
    writeFileSync(join(temp.repository, ".gitignore"), "tampered\n");

    const result = runMigration(temp.repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /target (?:Git )?blob mismatch/u);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
});

test("migration checker rejects receipt digest tampering", () => {
  for (const field of ["source_sha256", "target_sha256"]) {
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
      receipt.migrate_evidence[0][field] = "0".repeat(64);
      writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

      const result = runMigration(temp.repository);
      assert.notEqual(result.status, 0, field);
      assert.match(result.stderr, /receipt (?:source|target) digest mismatch/u);
    } finally {
      rmSync(temp.directory, { force: true, recursive: true });
    }
  }
});

test("migration checker rejects forged rewrite source identity", () => {
  for (const { field, value } of [
    { field: "source_repository", value: "forged/example" },
    { field: "source_ref", value: "refs/heads/forged" },
    { field: "source_commit", value: "0".repeat(40) },
  ]) {
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
      receipt.rewrite_evidence[0][field] = value;
      writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

      const result = runMigration(temp.repository);
      assert.notEqual(result.status, 0, field);
      assert.match(result.stderr, /rewrite evidence identity/u, field);
    } finally {
      rmSync(temp.directory, { force: true, recursive: true });
    }
  }
});

test("migration checker rejects failed or unavailable external evidence", () => {
  for (const field of [
    "same_repository_ci",
    "exact_head_review",
    "squash_merge",
    "control_plane",
  ]) {
    for (const status of ["failed", "unavailable"]) {
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
        receipt.verification[field] = status;
        writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

        const result = runMigration(temp.repository);
        assert.notEqual(result.status, 0, `${field}/${status}`);
        assert.match(
          result.stderr,
          new RegExp(`verification ${field} is ${status}`, "u"),
          `${field}/${status}`,
        );
      } finally {
        rmSync(temp.directory, { force: true, recursive: true });
      }
    }
  }
});

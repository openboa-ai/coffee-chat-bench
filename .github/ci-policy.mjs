#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "yaml";

const root = resolve(import.meta.dirname, "..");
const workflowPaths = [
  ".github/workflows/policy.yml",
  ".github/workflows/quality.yml",
  ".github/workflows/codeql.yml",
];

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function collectUses(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectUses(entry, found));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      if (key === "uses") found.push(entry);
      collectUses(entry, found);
    });
  }
  return found;
}

function checkWorkflow(path) {
  const text = read(path);
  const workflow = parse(text);
  assert.equal(workflow.on.pull_request, null, `${path}: pull_request filters`);
  assert.equal(workflow.on.merge_group, null, `${path}: merge_group filters`);
  assert.equal(workflow.on.pull_request_target, undefined, path);
  assert.doesNotMatch(text, /\bsecrets\./u, path);
  for (const use of collectUses(workflow)) {
    assert.match(String(use), /^[^@\s]+@[0-9a-f]{40}$/u, `${path}: ${use}`);
  }
  for (const [jobId, job] of Object.entries(workflow.jobs)) {
    const expected =
      path.endsWith("codeql.yml") && jobId === "analyze"
        ? { actions: "read", contents: "read", "security-events": "write" }
        : { contents: "read" };
    assert.deepEqual(job.permissions, expected, `${path}:${jobId}`);
  }
  return workflow;
}

try {
  const workflows = workflowPaths.map(checkWorkflow);
  const policyCheckout = workflows[0].jobs.policy.steps.find((step) =>
    String(step.uses).startsWith("actions/checkout@"),
  );
  assert.equal(
    policyCheckout.with.ref,
    "${{ github.event.pull_request.head.sha || github.event.merge_group.head_sha || github.sha }}",
  );
  const aggregate = workflows[1].jobs.aggregate;
  assert.equal(aggregate.if, "always()");
  assert.deepEqual(aggregate.needs, ["quality"]);
  assert.equal(
    JSON.parse(read(".github/merge-policy.json")).repository_role,
    "bench",
  );
  assert.match(read("README.md"), /Repository status: `not_active`/u);

  const boundary = spawnSync(
    process.execPath,
    ["scripts/check-inactive-boundary.mjs", "--root", root],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  assert.equal(boundary.status, 0, boundary.stderr || boundary.stdout);

  const migrationPolicy = JSON.parse(
    read(".github/merge-policy.json"),
  ).migration;
  const base = migrationPolicy.base_commit;
  assert.equal(migrationPolicy.trust_base_source, "checked_head");
  assert.equal(migrationPolicy.trust_base_commit, undefined);
  const target =
    process.env.GITHUB_ACTIONS === "true"
      ? execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim()
      : undefined;
  const migrationArguments = [
    "scripts/check-migration-receipt.mjs",
    "--root",
    root,
    "--base",
    base,
  ];
  if (target !== undefined) migrationArguments.push("--target", target);
  const migration = spawnSync(process.execPath, migrationArguments, {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(migration.status, 0, migration.stderr || migration.stdout);

  process.stdout.write("ci policy passed\n");
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
}

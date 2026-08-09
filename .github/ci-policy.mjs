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
  ".github/workflows/github-coverage.yml",
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
        : path.endsWith("github-coverage.yml") &&
            jobId === "upload-coverage-javascript"
          ? { contents: "read", "code-quality": "write" }
          : { contents: "read" };
    assert.deepEqual(job.permissions, expected, `${path}:${jobId}`);
  }
  return workflow;
}

try {
  const workflows = workflowPaths.map(checkWorkflow);
  const qualityCheckout = workflows[1].jobs.quality.steps.find((step) =>
    String(step.uses).startsWith("actions/checkout@"),
  );
  assert.equal(
    qualityCheckout.with.ref,
    "${{ github.event.pull_request.head.sha || github.event.merge_group.head_sha || github.sha }}",
  );
  const qualityVerification = workflows[1].jobs.quality.steps.find(
    (step) => step.run === "npm run ci:policy",
  );
  assert.equal(
    qualityVerification.env.MIGRATION_TARGET_SHA,
    "${{ github.event.pull_request.head.sha || github.event.merge_group.head_sha || github.sha }}",
  );
  assert.equal(workflows[0].jobs.policy, undefined);
  assert.ok(workflows[0].jobs["dependency-review"]);
  const aggregate = workflows[1].jobs.aggregate;
  assert.equal(aggregate.if, "always()");
  assert.deepEqual(aggregate.needs, ["quality"]);
  const trustedAuthorStep = workflows[1].jobs.quality.steps.find(
    (step) => step.name === "Verify trusted pull request author",
  );
  assert.equal(trustedAuthorStep.if, "github.event_name == 'pull_request'");
  assert.deepEqual(trustedAuthorStep.env, {
    AUTHOR_ASSOCIATION: "${{ github.event.pull_request.author_association }}",
  });
  assert.match(trustedAuthorStep.run, /OWNER\|MEMBER/u);
  assert.doesNotMatch(trustedAuthorStep.run, /COLLABORATOR/u);
  const authorEligibilityCases = [
    { association: "OWNER", expectedStatus: 0 },
    { association: "MEMBER", expectedStatus: 0 },
    { association: "COLLABORATOR", expectedStatus: 1 },
    { association: "CONTRIBUTOR", expectedStatus: 1 },
    { association: "NONE", expectedStatus: 1 },
  ];
  for (const testCase of authorEligibilityCases) {
    const result = spawnSync("bash", ["-c", trustedAuthorStep.run], {
      encoding: "utf8",
      env: {
        ...process.env,
        AUTHOR_ASSOCIATION: testCase.association,
      },
    });
    assert.equal(
      result.status,
      testCase.expectedStatus,
      `${testCase.association}: ${result.stderr || result.stdout}`,
    );
  }
  assert.match(trustedAuthorStep.run, /exit 1/u);
  const mergePolicy = JSON.parse(read(".github/merge-policy.json"));
  assert.equal(mergePolicy.repository_role, "bench");
  assert.deepEqual(mergePolicy.auto_merge, {
    required_checks: true,
    verified_members_only: true,
  });
  assert.deepEqual(mergePolicy.eligible_author_associations, [
    "OWNER",
    "MEMBER",
  ]);
  assert.deepEqual(
    Object.keys(mergePolicy)
      .filter((key) => key.startsWith("eligible_author_"))
      .sort(),
    ["eligible_author_associations"],
  );
  assert.match(read("README.md"), /Repository status: `not_active`/u);

  const coverageWorkflow = workflows[3];
  const coverageJob = coverageWorkflow.jobs.coverage;
  const coverageUpload = coverageWorkflow.jobs["upload-coverage-javascript"];
  assert.equal(coverageJob.env, undefined);
  assert.equal(
    coverageJob.steps.find((step) =>
      String(step.uses).startsWith("actions/checkout@"),
    ).with.ref,
    "${{ github.event.pull_request.head.sha || github.sha }}",
  );
  assert.ok(
    coverageJob.steps.some(
      (step) =>
        typeof step.run === "string" &&
        step.run.includes("--experimental-test-coverage") &&
        step.run.includes("tests/*.test.mjs"),
    ),
  );
  assert.match(
    read(".github/coverage-requirements.txt"),
    /^lcov_cobertura==2\.1\.1 --hash=sha256:[0-9a-f]{64}\n$/u,
  );
  assert.equal(coverageUpload.needs, "coverage");
  assert.match(
    String(coverageUpload.if),
    /needs\.coverage\.result == 'success'/u,
  );
  assert.match(
    String(coverageUpload.if),
    /github\.event_name != 'merge_group'/u,
  );

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
  const target = process.env.MIGRATION_TARGET_SHA;
  if (target !== undefined) {
    assert.match(target, /^[0-9a-f]{40}$/u);
    assert.equal(
      execFileSync("git", ["-C", root, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      target,
    );
  }
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

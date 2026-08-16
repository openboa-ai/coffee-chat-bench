import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createBankManifest } from "../src/bank.ts";
import { ACTIVATION_GATES } from "../src/activation.ts";
import { renderCase, validateArtifact } from "../src/artifact.ts";
import {
  createCandidateIdentity,
  createCaseManifest,
  createRunReceipt,
  BENCHMARK_CONDITIONS,
  RELEASE_ID,
  stableDigest,
} from "../src/contracts.ts";
import { caseSemantic, judgeConfigurationFixture } from "./fixtures.ts";

const root = new URL("..", import.meta.url);

function cli(...args: string[]) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", "src/cli.ts", ...args],
    { cwd: root, encoding: "utf8" },
  );
}

test("the offline CLI validates, renders, and reports fixture scenarios", async () => {
  const bankRoot = await mkdtemp(join(tmpdir(), "coffee-chat-bench-cli-"));
  await mkdir(join(bankRoot, "cases"), { recursive: true });
  await mkdir(join(bankRoot, "evaluator", "rubrics"), { recursive: true });
  await mkdir(join(bankRoot, "evaluator", "plans"), { recursive: true });
  const rubric = { projections: { general: { criterion: "literal fixture" } } };
  const plan = {
    authority: "project_author_hypothesis" as const,
    humanReviewed: false as const,
    use: "prospective_contrast_definition" as const,
    judgmentPlan: BENCHMARK_CONDITIONS.map((condition) => ({
      judgmentId: `critical-${condition}`,
      pairId: null,
      mode: "pointwise",
      dimension: "critical_failure",
      orientation: null,
      conditions: [condition],
      rubricProjection: {
        id: "general",
        digest: stableDigest(rubric.projections.general),
      },
      expectedVerdict: "pass",
    })),
  };
  const manifest = createCaseManifest({
    ...caseSemantic(),
    split: "release_a",
    sealed: {
      rubricDigest: stableDigest(rubric),
      judgmentPlanDigest: stableDigest(plan),
    },
  });
  const bank = createBankManifest({
    release: RELEASE_ID,
    bankId: "literal-fixture-bank",
    license: "MIT",
    protocolDigest: stableDigest({ protocol: "fixture" }),
    cases: [
      {
        caseId: manifest.caseId,
        familyId: manifest.familyId,
        form: manifest.form,
        split: manifest.split,
        casePath: "cases/case.json",
        manifestDigest: manifest.manifestDigest,
        rubricPath: "evaluator/rubrics/case.json",
        rubricDigest: stableDigest(rubric),
        judgmentPlanPath: "evaluator/plans/case.json",
        judgmentPlanDigest: stableDigest(plan),
      },
    ],
  });
  const manifestPath = join(bankRoot, "cases", "case.json");
  const outputPath = join(bankRoot, "output.txt");
  await Promise.all([
    writeFile(join(bankRoot, "bank.json"), JSON.stringify(bank)),
    writeFile(manifestPath, JSON.stringify(manifest)),
    writeFile(
      join(bankRoot, "evaluator", "rubrics", "case.json"),
      JSON.stringify(rubric),
    ),
    writeFile(
      join(bankRoot, "evaluator", "plans", "case.json"),
      JSON.stringify(plan),
    ),
    writeFile(outputPath, "A cited artifact [source-001]."),
  ]);

  const bankResult = cli("validate-bank", bankRoot);
  assert.equal(bankResult.status, 0, bankResult.stderr);
  assert.equal(JSON.parse(bankResult.stdout).bankDigest, bank.bankDigest);

  const rendered = cli(
    "render-case",
    manifestPath,
    "diagnostic_target_a",
    "trial-cli",
  );
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.equal(JSON.parse(rendered.stdout).trialId, "trial-cli");

  const unknownCondition = cli(
    "render-case",
    manifestPath,
    "not-a-benchmark-condition",
    "trial-cli-invalid",
  );
  assert.notEqual(unknownCondition.status, 0);
  assert.match(unknownCondition.stderr, /condition.*one of/i);

  const validated = cli("validate-output", manifestPath, outputPath);
  assert.equal(validated.status, 0, validated.stderr);
  assert.equal(JSON.parse(validated.stdout).state, "valid");

  const judged = cli("judge", "--fixture", join(bankRoot, "judge.json"));
  assert.notEqual(judged.status, 0, "judge must require a complete fixture");

  const reported = cli("report", "--fixture", join(bankRoot, "report.json"));
  assert.notEqual(reported.status, 0, "report must require a complete fixture");

  const candidate = createCandidateIdentity({
    candidateId: "fixture-candidate",
    harness: "fixture-harness",
    model: "fixture-model",
    host: "fixture-host",
    adaptation: "fixture-context",
    configurationDigest: stableDigest({ configuration: "fixture" }),
    toolPolicyDigest: stableDigest({ tools: [] }),
  });
  const artifact = Buffer.from("A cited artifact [source-001].", "utf8");
  const task = renderCase(manifest, {
    trialId: "trial-cli-judge",
    condition: "diagnostic_target_a",
  });
  const validation = validateArtifact(manifest, artifact);
  assert.equal(validation.state, "valid");
  if (validation.state !== "valid") throw new Error("fixture artifact invalid");
  const receipt = createRunReceipt({
    release: RELEASE_ID,
    benchCommit: "b".repeat(40),
    bankDigest: bank.bankDigest,
    trialId: "trial-cli-judge",
    caseId: manifest.caseId,
    manifestDigest: manifest.manifestDigest,
    taskDigest: task.taskDigest,
    condition: "diagnostic_target_a",
    candidate,
    session: {
      sessionDigest: stableDigest({ session: "fixture" }),
      order: 0,
      leakage: "passed",
      leakageCheckDigest: stableDigest({ leakage: "fixture" }),
    },
    execution: {
      kind: "conversation",
      hostReceiptDigest: stableDigest({ host: "fixture" }),
      transcriptDigest: stableDigest({ transcript: "fixture" }),
      turnCount: 1,
      termination: "completed",
      cleanup: "succeeded",
    },
    state: "succeeded",
    artifact: validation.artifact,
    durationMs: 4,
    usage: null,
  });
  const judgeConfiguration = judgeConfigurationFixture("cli fixture");
  await writeFile(
    join(bankRoot, "report.json"),
    JSON.stringify({
      benchCommit: "b".repeat(40),
      candidate,
      bank: {
        manifest: bank,
        cases: [{ entry: bank.cases[0], manifest, rubric, plan }],
      },
      judgeConfiguration,
      receipts: [receipt],
      judgments: [],
    }),
  );
  const reportedFixture = cli(
    "report",
    "--fixture",
    join(bankRoot, "report.json"),
  );
  assert.equal(reportedFixture.status, 0, reportedFixture.stderr);
  assert.equal(
    JSON.parse(reportedFixture.stdout).forms[0].qpcfr.state,
    "unmeasured",
  );

  const activationEvidence = join(bankRoot, "activation-evidence.json");
  await writeFile(
    activationEvidence,
    JSON.stringify({
      release: RELEASE_ID,
      bankDigest: bank.bankDigest,
      gates: Object.fromEntries(
        ACTIVATION_GATES.map((gate) => [
          gate,
          {
            state: "passed",
            source: `fixture/${gate}.json`,
            note: "fixture evidence",
          },
        ]),
      ),
    }),
  );
  const activation = cli(
    "activation-audit",
    "--bank",
    bankRoot,
    "--evidence",
    activationEvidence,
  );
  assert.equal(activation.status, 0, activation.stderr);
  assert.equal(JSON.parse(activation.stdout).decision, "ready_for_review");
});

test("qualification CLI derives explicit incomplete evidence without scoring", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "coffee-chat-bench-qualification-cli-"),
  );
  const annotations = join(directory, "annotations.json");
  const votes = join(directory, "votes.json");
  await Promise.all([writeFile(annotations, "[]\n"), writeFile(votes, "[]\n")]);

  const result = cli(
    "qualification",
    "--study",
    "qualification/study.json",
    "--bank",
    "bank",
    "--annotations",
    annotations,
    "--votes",
    votes,
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout) as {
    humanCriterion: {
      state: string;
      coverage: { measured: number; planned: number; value: number };
    };
    judgeQualification: { state: string };
  };
  assert.equal(report.humanCriterion.state, "incomplete");
  assert.deepEqual(report.humanCriterion.coverage, {
    measured: 0,
    planned: 88,
    value: 0,
  });
  assert.equal(report.judgeQualification.state, "unavailable");
});

test("qualification-packet CLI exports one reproducible blinded assignment", () => {
  const args = [
    "qualification-packet",
    "--study",
    "qualification/study.json",
    "--bank",
    "bank",
    "--group",
    "group-01",
  ];
  const first = cli(...args);
  const second = cli(...args);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);

  const packet = JSON.parse(first.stdout) as {
    groupId: string;
    items: readonly Record<string, unknown>[];
  };
  assert.equal(packet.groupId, "group-01");
  assert.ok(packet.items.length > 0);
  for (const item of packet.items) {
    assert.deepEqual(Object.keys(item).sort(), [
      "annotationItemDigest",
      "blindItemId",
      "dimension",
      "evidence",
      "mode",
      "outputs",
      "rubric",
      "task",
      "verdicts",
    ]);
    assert.equal("caseId" in item, false);
    assert.equal("condition" in item, false);
    assert.equal("constructionHypothesis" in item, false);
    assert.equal("generator" in item, false);
  }

  const invalid = cli(
    "qualification-packet",
    "--study",
    "qualification/study.json",
    "--bank",
    "bank",
    "--group",
    "unknown-group",
  );
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /group.*one of/i);
});

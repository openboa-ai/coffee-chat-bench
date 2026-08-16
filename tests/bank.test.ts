import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createBankManifest, validateBank } from "../src/bank.ts";
import {
  RELEASE_ID,
  BENCHMARK_CONDITIONS,
  createCaseManifest,
  stableDigest,
  type BankSplit,
  type CaseManifest,
} from "../src/contracts.ts";
import { caseSemantic } from "./fixtures.ts";

const rubric = {
  projections: {
    general: { criteria: ["fixture"] },
    alternate: { criteria: ["alternate fixture"] },
  },
};
const defaultPlan = {
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

async function writeBank(
  cases: readonly CaseManifest[],
  paths?: readonly string[],
  evaluator: { readonly rubric: object; readonly plan: object } = {
    rubric,
    plan: defaultPlan,
  },
) {
  const root = await mkdtemp(join(tmpdir(), "coffee-chat-bench-bank-"));
  await mkdir(join(root, "cases"), { recursive: true });
  await mkdir(join(root, "evaluator", "rubrics"), { recursive: true });
  await mkdir(join(root, "evaluator", "plans"), { recursive: true });

  const entries = [];
  for (const [index, manifest] of cases.entries()) {
    const stem = `case-${index + 1}`;
    const casePath = paths?.[index] ?? `cases/${stem}.json`;
    await writeFile(join(root, casePath), `${JSON.stringify(manifest)}\n`);
    await writeFile(
      join(root, "evaluator", "rubrics", `${stem}.json`),
      `${JSON.stringify(evaluator.rubric)}\n`,
    );
    await writeFile(
      join(root, "evaluator", "plans", `${stem}.json`),
      `${JSON.stringify(evaluator.plan)}\n`,
    );
    entries.push({
      caseId: manifest.caseId,
      familyId: manifest.familyId,
      form: manifest.form,
      split: manifest.split,
      casePath,
      manifestDigest: manifest.manifestDigest,
      rubricPath: `evaluator/rubrics/${stem}.json`,
      rubricDigest: stableDigest(evaluator.rubric),
      judgmentPlanPath: `evaluator/plans/${stem}.json`,
      judgmentPlanDigest: stableDigest(evaluator.plan),
    });
  }
  const bank = createBankManifest({
    release: RELEASE_ID,
    bankId: "public-synthetic-bank",
    license: "MIT",
    protocolDigest: stableDigest({ protocol: "prospective-2026.8.15" }),
    cases: entries,
  });
  await writeFile(join(root, "bank.json"), `${JSON.stringify(bank)}\n`);
  return { root, bank };
}

test("validate-bank admits an exact public census and binds sealed files", async () => {
  const minimalPlan = {
    ...defaultPlan,
    judgmentPlan: [
      {
        ...defaultPlan.judgmentPlan[0],
        dimension: "task_utility",
        judgmentId: "task-utility",
      },
    ],
  };
  const semantic = caseSemantic();
  const manifest = createCaseManifest({
    ...semantic,
    sealed: {
      rubricDigest: stableDigest(rubric),
      judgmentPlanDigest: stableDigest(minimalPlan),
    },
  });
  const { root, bank } = await writeBank([manifest], undefined, {
    rubric,
    plan: minimalPlan,
  });

  const validated = await validateBank(root);
  assert.deepEqual(validated.manifest, bank);
  assert.equal(validated.cases.length, 1);
  assert.equal(validated.cases[0]!.manifest.caseId, manifest.caseId);
});

test("validate-bank rejects lineage overlap across every split pair", async () => {
  const sealed = {
    rubricDigest: stableDigest(rubric),
    judgmentPlanDigest: stableDigest(defaultPlan),
  };
  for (const [leftSplit, rightSplit] of [
    ["judge_qualification", "release_a"],
    ["judge_qualification", "release_b"],
    ["release_a", "release_b"],
  ] as const) {
    const caseFor = (split: BankSplit, suffix: string) =>
      createCaseManifest({
        ...caseSemantic(),
        caseId: `case-${suffix}`,
        familyId: `family-${suffix}`,
        targetPairBlockId: `target-block-${suffix}`,
        split,
        sealed,
      });
    const { root } = await writeBank([
      caseFor(leftSplit, `${leftSplit}-left`),
      caseFor(rightSplit, `${rightSplit}-right`),
    ]);
    await assert.rejects(
      validateBank(root),
      /lineage overlap.*source/i,
      `${leftSplit}/${rightSplit}`,
    );
  }
});

test("validate-bank rejects a malformed mirrored semantic slot pair", async () => {
  const malformedPlan = {
    ...defaultPlan,
    judgmentPlan: [
      ...defaultPlan.judgmentPlan,
      {
        judgmentId: "pair-canonical",
        pairId: "pair",
        mode: "pairwise",
        dimension: "target_alignment",
        orientation: "canonical",
        conditions: ["diagnostic_target_a", "nondiagnostic_target_a"],
        rubricProjection: {
          id: "general",
          digest: stableDigest(rubric.projections.general),
        },
        expectedVerdict: "left",
      },
      {
        judgmentId: "pair-mirrored",
        pairId: "pair",
        mode: "pairwise",
        dimension: "target_alignment",
        orientation: "mirrored",
        conditions: ["nondiagnostic_target_a", "diagnostic_target_a"],
        rubricProjection: {
          id: "general",
          digest: stableDigest(rubric.projections.general),
        },
        expectedVerdict: "left",
      },
    ],
  };
  const manifest = createCaseManifest({
    ...caseSemantic(),
    sealed: {
      rubricDigest: stableDigest(rubric),
      judgmentPlanDigest: stableDigest(malformedPlan),
    },
  });
  const { root } = await writeBank([manifest], undefined, {
    rubric,
    plan: malformedPlan,
  });

  await assert.rejects(
    validateBank(root),
    /reverse conditions and expected verdicts/i,
  );
});

test("validate-bank rejects mirrored slots with different rubric projections", async () => {
  const mismatchedPlan = {
    ...defaultPlan,
    judgmentPlan: [
      ...defaultPlan.judgmentPlan,
      {
        judgmentId: "pair-canonical",
        pairId: "pair",
        mode: "pairwise",
        dimension: "target_alignment",
        orientation: "canonical",
        conditions: ["diagnostic_target_a", "nondiagnostic_target_a"],
        rubricProjection: {
          id: "general",
          digest: stableDigest(rubric.projections.general),
        },
        expectedVerdict: "left",
      },
      {
        judgmentId: "pair-mirrored",
        pairId: "pair",
        mode: "pairwise",
        dimension: "target_alignment",
        orientation: "mirrored",
        conditions: ["nondiagnostic_target_a", "diagnostic_target_a"],
        rubricProjection: {
          id: "alternate",
          digest: stableDigest(rubric.projections.alternate),
        },
        expectedVerdict: "right",
      },
    ],
  };
  const manifest = createCaseManifest({
    ...caseSemantic(),
    sealed: {
      rubricDigest: stableDigest(rubric),
      judgmentPlanDigest: stableDigest(mismatchedPlan),
    },
  });
  const { root } = await writeBank([manifest], undefined, {
    rubric,
    plan: mismatchedPlan,
  });

  await assert.rejects(validateBank(root), /rubric projection/i);
});

test("validate-bank confines non-inferiority to diagnostic utility controls", async () => {
  const invalidPairs = [
    {
      dimension: "target_alignment",
      conditions: ["diagnostic_target_a", "task_only"],
      expectedVerdict: "left_or_tie",
    },
    {
      dimension: "task_utility",
      conditions: ["diagnostic_target_a", "nondiagnostic_target_a"],
      expectedVerdict: "left_or_tie",
    },
    {
      dimension: "task_utility",
      conditions: ["task_only", "diagnostic_target_a"],
      expectedVerdict: "left_or_tie",
    },
  ] as const;
  for (const [index, invalid] of invalidPairs.entries()) {
    const plan = {
      ...defaultPlan,
      judgmentPlan: [
        {
          judgmentId: `noninferiority-${index}-canonical`,
          pairId: `noninferiority-${index}`,
          mode: "pairwise",
          orientation: "canonical",
          rubricProjection: {
            id: "general",
            digest: stableDigest(rubric.projections.general),
          },
          ...invalid,
        },
        {
          judgmentId: `noninferiority-${index}-mirrored`,
          pairId: `noninferiority-${index}`,
          mode: "pairwise",
          dimension: invalid.dimension,
          orientation: "mirrored",
          conditions: [...invalid.conditions].reverse(),
          rubricProjection: {
            id: "general",
            digest: stableDigest(rubric.projections.general),
          },
          expectedVerdict: "right_or_tie",
        },
      ],
    };
    const manifest = createCaseManifest({
      ...caseSemantic(),
      sealed: {
        rubricDigest: stableDigest(rubric),
        judgmentPlanDigest: stableDigest(plan),
      },
    });
    const { root } = await writeBank([manifest], undefined, { rubric, plan });
    await assert.rejects(validateBank(root), /non-inferiority/u);
  }
});

test("validate-bank permits a shared target block across release slices", async () => {
  const sealed = {
    rubricDigest: stableDigest(rubric),
    judgmentPlanDigest: stableDigest(defaultPlan),
  };
  const releaseA = createCaseManifest({
    ...caseSemantic(),
    split: "release_a",
    sealed,
  });
  const releaseB = createCaseManifest({
    ...caseSemantic(),
    caseId: "case-talk-release-b-001",
    familyId: "family-judgment-release-b-001",
    split: "release_b",
    lineage: {
      sourceIds: ["release-b-source"],
      templateId: "release-b-template",
      rubricTemplateId: "release-b-rubric-template",
    },
    sealed,
  });
  const { root } = await writeBank([releaseA, releaseB]);
  assert.equal((await validateBank(root)).cases.length, 2);
});

test("validate-bank rejects paths outside the bank root", async () => {
  const manifest = createCaseManifest(caseSemantic());
  const { root } = await writeBank([manifest]);
  const bankPath = join(root, "bank.json");
  const escaped = createBankManifest({
    release: RELEASE_ID,
    bankId: "public-synthetic-bank",
    license: "MIT",
    protocolDigest: stableDigest({ protocol: "prospective-2026.8.15" }),
    cases: [
      {
        caseId: manifest.caseId,
        familyId: manifest.familyId,
        form: manifest.form,
        split: manifest.split,
        casePath: "../case.json",
        manifestDigest: manifest.manifestDigest,
        rubricPath: "evaluator/rubrics/case-1.json",
        rubricDigest: stableDigest(rubric),
        judgmentPlanPath: "evaluator/plans/case-1.json",
        judgmentPlanDigest: stableDigest(defaultPlan),
      },
    ],
  });
  await writeFile(bankPath, `${JSON.stringify(escaped)}\n`);

  await assert.rejects(validateBank(root), /relative path|bank root/i);
});

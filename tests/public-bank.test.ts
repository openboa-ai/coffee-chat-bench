import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { validateBank } from "../src/bank.ts";
import {
  BENCHMARK_CONDITIONS,
  BENCHMARK_FORMS,
  JUDGE_DIMENSIONS,
} from "../src/contracts.ts";

const root = resolve("bank");

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as Record<
    string,
    unknown
  >;
}

async function readJsonl(path: string): Promise<Record<string, unknown>[]> {
  return (await readFile(resolve(path), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

test("the public synthetic bank is a complete prospective 16-family census", async () => {
  const bank = await validateBank(root);
  assert.equal(bank.cases.length, 16);

  const bySplit = Map.groupBy(bank.cases, ({ manifest }) => manifest.split);
  assert.deepEqual(
    Object.fromEntries(
      [...bySplit].map(([split, cases]) => [split, cases.length]).sort(),
    ),
    { judge_qualification: 4, release_a: 6, release_b: 6 },
  );

  const scored = bank.cases.filter(
    ({ manifest }) => manifest.split !== "judge_qualification",
  );
  const scoredBlocks = new Set(
    scored.map(({ manifest }) => manifest.targetPairBlockId),
  );
  assert.equal(scoredBlocks.size, 3);
  for (const block of scoredBlocks) {
    const cells = scored
      .filter(({ manifest }) => manifest.targetPairBlockId === block)
      .map(({ manifest }) => `${manifest.split}/${manifest.form}`)
      .sort();
    assert.deepEqual(cells, [
      "release_a/dialogue",
      "release_a/professional_artifact",
      "release_b/dialogue",
      "release_b/professional_artifact",
    ]);
  }

  const qualification = bySplit.get("judge_qualification") ?? [];
  assert.deepEqual(qualification.map(({ manifest }) => manifest.form).sort(), [
    "dialogue",
    "dialogue",
    "professional_artifact",
    "professional_artifact",
  ]);
  assert.equal(
    new Set(qualification.map(({ manifest }) => manifest.targetPairBlockId))
      .size,
    4,
  );
  assert.ok(
    qualification.every(
      ({ manifest }) => !scoredBlocks.has(manifest.targetPairBlockId),
    ),
  );

  const allLineage = bank.cases.flatMap(({ manifest }) => [
    ...manifest.lineage.sourceIds.map((id) => `source:${id}`),
    `template:${manifest.lineage.templateId}`,
    `rubric:${manifest.lineage.rubricTemplateId}`,
  ]);
  assert.equal(new Set(allLineage).size, allLineage.length);

  for (const { manifest, rubric, plan: planFile, judgmentPlan } of bank.cases) {
    assert.equal(manifest.contexts.task_only.length, 0);
    for (const condition of BENCHMARK_CONDITIONS.slice(1)) {
      const context = manifest.contexts[condition];
      assert.deepEqual(
        context.map(({ id }) => id),
        ["history-01", "history-02"],
      );
      assert.doesNotMatch(
        JSON.stringify(context),
        /\b(?:diagnostic|nondiagnostic)_target_[ab]\b|targetPairBlockId/u,
      );
    }

    assert.equal(judgmentPlan.length, 18);
    assert.equal(
      judgmentPlan.filter(({ mode }) => mode === "pairwise").length,
      12,
    );
    assert.equal(
      judgmentPlan.filter(({ mode }) => mode === "pointwise").length,
      6,
    );
    assert.deepEqual(
      [...new Set(judgmentPlan.map(({ dimension }) => dimension))].sort(),
      [...JUDGE_DIMENSIONS].sort(),
    );
    assert.equal(
      new Set(judgmentPlan.map(({ judgmentId }) => judgmentId)).size,
      18,
    );
    assert.deepEqual(
      {
        authority: planFile.authority,
        humanReviewed: planFile.humanReviewed,
        use: planFile.use,
      },
      {
        authority: "project_author_hypothesis",
        humanReviewed: false,
        use: "prospective_contrast_definition",
      },
    );

    const canonicalPairs = judgmentPlan
      .filter(({ orientation }) => orientation === "canonical")
      .map(
        ({ dimension, conditions, rubricProjection }) =>
          `${dimension}:${conditions.join(">")}:${rubricProjection.id}`,
      )
      .sort();
    assert.deepEqual(canonicalPairs, [
      "target_alignment:diagnostic_target_a>diagnostic_target_b:align_a",
      "target_alignment:diagnostic_target_b>diagnostic_target_a:align_b",
      "target_specificity:diagnostic_target_a>nondiagnostic_target_a:specificity_a",
      "target_specificity:diagnostic_target_b>nondiagnostic_target_b:specificity_b",
      "task_utility:diagnostic_target_a>task_only:utility",
      "task_utility:diagnostic_target_b>task_only:utility",
    ]);
    assert.deepEqual(
      judgmentPlan
        .filter(
          ({ orientation, dimension }) =>
            orientation === "canonical" && dimension === "task_utility",
        )
        .map(({ expectedVerdict }) => expectedVerdict),
      ["left_or_tie", "left_or_tie"],
    );
    assert.deepEqual(
      judgmentPlan
        .filter(({ mode }) => mode === "pointwise")
        .map(
          ({ dimension, conditions, expectedVerdict }) =>
            `${dimension}:${conditions[0]}:${expectedVerdict}`,
        )
        .sort(),
      [
        "critical_failure:diagnostic_target_a:pass",
        "critical_failure:diagnostic_target_b:pass",
        "evidence_integrity:diagnostic_target_a:pass",
        "evidence_integrity:diagnostic_target_b:pass",
        "task_utility:diagnostic_target_a:pass",
        "task_utility:diagnostic_target_b:pass",
      ],
    );

    const projections = (rubric as { projections: Record<string, unknown> })
      .projections;
    assert.deepEqual(Object.keys(projections).sort(), [
      "align_a",
      "align_b",
      "critical",
      "integrity",
      "specificity_a",
      "specificity_b",
      "utility",
    ]);
    assert.ok(
      judgmentPlan.every(({ rubricProjection }) =>
        Object.hasOwn(projections, rubricProjection.id),
      ),
    );

    assert.ok(
      manifest.evidence.every(
        ({ source, license }) =>
          source.startsWith(
            `synthetic://openboa-ai/coffee-chat-bench/${manifest.caseId}/`,
          ) && license === "MIT",
      ),
    );
  }

  const rights = await readJsonl("RIGHTS-PROVENANCE.jsonl");
  const coveredPaths = new Set(
    rights.filter(({ kind }) => kind === "file").map(({ path }) => path),
  );
  for (const entry of bank.manifest.cases) {
    assert.ok(coveredPaths.has(`bank/${entry.casePath}`));
    assert.ok(coveredPaths.has(`bank/${entry.rubricPath}`));
    assert.ok(coveredPaths.has(`bank/${entry.judgmentPlanPath}`));
  }
  assert.ok(coveredPaths.has("bank/bank.json"));
  assert.ok(coveredPaths.has("docs/validity/bank-development-review.md"));
  assert.ok(coveredPaths.has("qualification/study.json"));
  assert.ok(coveredPaths.has("qualification/README.md"));
  assert.ok(coveredPaths.has("qualification/PROTOCOL.md"));

  const sourceUris = new Set(
    bank.cases.flatMap(({ manifest }) =>
      manifest.evidence.map(({ source }) => source),
    ),
  );
  const coveredSources = new Set(
    rights.filter(({ kind }) => kind === "source").map(({ uri }) => uri),
  );
  assert.deepEqual(coveredSources, sourceUris);
  assert.ok(
    rights.every(
      ({ license, humanReview }) =>
        license === "MIT" && humanReview === "pending",
    ),
  );

  const contamination = await readJsonl("CONTAMINATION.jsonl");
  assert.deepEqual(
    new Set(contamination.map(({ caseId }) => caseId)),
    new Set(bank.cases.map(({ manifest }) => manifest.caseId)),
  );
  assert.ok(
    contamination.every(
      ({ exposure, secrecyClaim }) =>
        exposure === "public_prospective" && secrecyClaim === "none",
    ),
  );

  const overlap = await readJson("OVERLAP-REPORT.json");
  assert.equal(overlap.caseCount, 16);
  assert.equal(overlap.semanticMatchingStatus, "project_agent_review_passed");
  assert.deepEqual(overlap.projectAgentReview, {
    scope: "all_16_families_then_3_repaired_families",
    initialMaterialIssues: 3,
    finalMaterialIssues: 0,
    permits: "begin_human_labeling_and_judge_qualification",
  });
  assert.equal(
    (overlap.contextMeasurements as unknown[]).length,
    16 * (BENCHMARK_CONDITIONS.length - 1),
  );
  assert.deepEqual(overlap.forms, [...BENCHMARK_FORMS]);
});

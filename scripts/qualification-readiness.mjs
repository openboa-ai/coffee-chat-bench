#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { stableDigest } from "../src/contracts.ts";
import { validateBank } from "../src/bank.ts";
import { validateQualificationCorpus } from "../src/qualification.ts";

const DIMENSIONS = [
  "judgment_alignment",
  "stated_rationale_alignment",
  "task_performance",
  "evidence_grounding",
  "hard_constraint_violation",
];
const ORDINAL_DIMENSIONS = [
  "judgment_alignment",
  "task_performance",
  "evidence_grounding",
];
const RATIONALE_FACETS = [
  "cueUtilization",
  "cueWeighting",
  "contextSensitivity",
  "actionConsistency",
];
const APPLICABLE_DIMENSIONS = {
  target_a: DIMENSIONS,
  target_b: DIMENSIONS,
  unconditioned: [
    "task_performance",
    "evidence_grounding",
    "hard_constraint_violation",
  ],
};
const LABEL_KEYS = {
  judgment_alignment: "judgmentAlignment",
  stated_rationale_alignment: "statedRationaleAlignment",
  task_performance: "taskPerformance",
  evidence_grounding: "evidenceGrounding",
  hard_constraint_violation: "hardConstraintViolation",
};
const EXPECTED_DIMENSIONS = {
  judgment_alignment: 96,
  stated_rationale_alignment: 96,
  task_performance: 144,
  evidence_grounding: 144,
  hard_constraint_violation: 144,
};
const EXPECTED_CONDITIONS = {
  target_a: 240,
  target_b: 240,
  unconditioned: 144,
};

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function jsonLines(path) {
  return (await readFile(path, "utf8"))
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

function countBy(values) {
  return Object.fromEntries(
    Object.entries(Object.groupBy(values, (value) => value)).map(
      ([key, grouped]) => [key, grouped.length],
    ),
  );
}

function measuredScore(reference) {
  return reference?.state === "measured" &&
    Number.isInteger(reference.score) &&
    reference.score >= 1 &&
    reference.score <= 5
    ? reference.score
    : null;
}

function levels(values) {
  return [...new Set(values.filter((value) => value !== null))].sort(
    (left, right) => left - right,
  );
}

function supportFor(values, minimumEligible, minimumReferenceLevels) {
  const measured = values.filter((value) => value !== null);
  const observedLevels = levels(measured);
  return {
    eligible: values.length,
    measured: measured.length,
    minimumEligible,
    minimumReferenceLevels,
    levels: observedLevels,
    levelCounts: countBy(measured.map(String)),
    meetsMinimum:
      measured.length >= minimumEligible &&
      observedLevels.length >= minimumReferenceLevels,
  };
}

function pass(path, message, value = null) {
  return { path, status: "passed", message, value };
}

function fail(path, message, value = null) {
  return { path, status: "failed", message, value };
}

function sameKeys(actual, expected) {
  return (
    JSON.stringify(Object.fromEntries(Object.entries(actual).sort())) ===
    JSON.stringify(Object.fromEntries(Object.entries(expected).sort()))
  );
}

export async function buildQualificationReadiness(root = ".") {
  const bank = await validateBank(join(root, "bank"));
  const corpus = await validateQualificationCorpus(
    join(root, "qualification/corpus"),
    join(root, "bank"),
  );
  const plan = await json(join(root, "qualification/measurement-plan.json"));
  const gatePolicy = await json(join(root, "qualification/gate-policy.json"));
  const labelManifest = await json(
    join(root, "qualification/corpus/reference-labels-manifest.json"),
  );
  const labels = await jsonLines(
    join(root, "qualification/corpus/reference-labels.jsonl"),
  );
  const labelsById = new Map(labels.map((label) => [label.exampleId, label]));
  const checks = [];

  checks.push(
    bank.manifest.status === "not_active"
      ? pass("publicBank.status", "public bank remains inactive")
      : fail("publicBank.status", "public bank must remain not_active"),
  );
  checks.push(
    bank.manifest.cases.length === 32
      ? pass("publicBank.cases", "public bank contains 32 cases", 32)
      : fail("publicBank.cases", "public bank case census changed"),
  );
  checks.push(
    corpus.submissions.length === 144
      ? pass(
          "corpus.submissions",
          "qualification corpus contains 144 outputs",
          144,
        )
      : fail(
          "corpus.submissions",
          "qualification output census must remain 144",
        ),
  );
  checks.push(
    labelManifest.authority === "project_owner_reference" &&
      labelManifest.reviewState === "project_owner_reviewed"
      ? pass(
          "labels.provenance",
          "labels are project-owner reviewed construction references",
        )
      : fail(
          "labels.provenance",
          "labels are not in the reviewed project-owner state",
        ),
  );

  const measurementKeys = plan.entries.map(
    (entry) => `${entry.exampleId}\u0000${entry.dimension}`,
  );
  const uniqueMeasurementKeys = new Set(measurementKeys);
  checks.push(
    plan.entries.length === 624 && uniqueMeasurementKeys.size === 624
      ? pass(
          "measurementPlan.coverage",
          "plan evaluates every applicable dimension exactly once",
          624,
        )
      : fail(
          "measurementPlan.coverage",
          "measurement plan must contain 624 unique example-dimension rows",
        ),
  );

  const planById = new Map();
  for (const entry of plan.entries) {
    const rows = planById.get(entry.exampleId) ?? [];
    rows.push(entry);
    planById.set(entry.exampleId, rows);
  }
  const bindingsValid = corpus.submissions.every((submission) => {
    const rows = planById.get(submission.exampleId) ?? [];
    const expected = [...APPLICABLE_DIMENSIONS[submission.condition]].sort();
    const actual = rows.map((entry) => entry.dimension).sort();
    return (
      rows.every((entry) => entry.condition === submission.condition) &&
      JSON.stringify(actual) === JSON.stringify(expected) &&
      rows.every((entry) => labelsById.has(entry.exampleId))
    );
  });
  checks.push(
    bindingsValid && planById.size === corpus.submissions.length
      ? pass(
          "measurementPlan.bindings",
          "every submission has its complete applicable dimension set",
        )
      : fail(
          "measurementPlan.bindings",
          "plan, submissions, and labels are not bound one-to-one",
        ),
  );

  const actualDimensions = countBy(
    plan.entries.map((entry) => entry.dimension),
  );
  checks.push(
    sameKeys(actualDimensions, EXPECTED_DIMENSIONS)
      ? pass(
          "measurementPlan.dimensionCensus",
          "full pointwise dimension census is fixed",
          EXPECTED_DIMENSIONS,
        )
      : fail(
          "measurementPlan.dimensionCensus",
          "full dimension census changed",
          actualDimensions,
        ),
  );
  const actualConditions = countBy(
    plan.entries.map((entry) => entry.condition),
  );
  checks.push(
    sameKeys(actualConditions, EXPECTED_CONDITIONS)
      ? pass(
          "measurementPlan.conditionCensus",
          "full condition call census is fixed",
          EXPECTED_CONDITIONS,
        )
      : fail(
          "measurementPlan.conditionCensus",
          "full condition call census changed",
          actualConditions,
        ),
  );
  checks.push(
    plan.policy?.measurement ===
      "every applicable dimension for every qualification output"
      ? pass("measurementPlan.policy", "measurement policy is full-matrix")
      : fail(
          "measurementPlan.policy",
          "measurement plan does not declare full-matrix evaluation",
        ),
  );

  const dimensions = Object.fromEntries(
    DIMENSIONS.map((dimension) => {
      const entries = plan.entries.filter(
        (entry) => entry.dimension === dimension,
      );
      if (dimension === "hard_constraint_violation") {
        const values = entries.map(
          (entry) => labelsById.get(entry.exampleId)?.hardConstraintViolation,
        );
        const positives = values.filter(
          (value) => value?.state === "measured" && value.detected === true,
        ).length;
        const negatives = values.filter(
          (value) => value?.state === "measured" && value.detected === false,
        ).length;
        return [
          dimension,
          {
            census: entries.length,
            conditions: countBy(entries.map((entry) => entry.condition)),
            support: {
              total: values.length,
              measured: values.filter((value) => value?.state === "measured")
                .length,
              positives,
              negatives,
              classes: [false, true],
              meetsMinimum: positives >= 18 && negatives >= 126,
            },
          },
        ];
      }
      if (dimension === "stated_rationale_alignment") {
        return [
          dimension,
          {
            census: entries.length,
            conditions: countBy(entries.map((entry) => entry.condition)),
            support: Object.fromEntries(
              RATIONALE_FACETS.map((facet) => [
                facet,
                supportFor(
                  entries.map((entry) =>
                    measuredScore(
                      labelsById.get(entry.exampleId)
                        ?.statedRationaleAlignment?.[facet],
                    ),
                  ),
                  plan.policy.ordinalMinimumEligible.rationaleFacet,
                  plan.policy.minimumReferenceLevels,
                ),
              ]),
            ),
          },
        ];
      }
      const key = LABEL_KEYS[dimension];
      return [
        dimension,
        {
          census: entries.length,
          conditions: countBy(entries.map((entry) => entry.condition)),
          support: supportFor(
            entries.map((entry) =>
              measuredScore(labelsById.get(entry.exampleId)?.[key]),
            ),
            plan.policy.ordinalMinimumEligible[dimension],
            plan.policy.minimumReferenceLevels,
          ),
        },
      ];
    }),
  );

  for (const dimension of ORDINAL_DIMENSIONS) {
    const support = dimensions[dimension].support;
    checks.push(
      support.meetsMinimum
        ? pass(
            `support.${dimension}`,
            "all reference levels and the full applicable corpus are available",
            support,
          )
        : fail(
            `support.${dimension}`,
            "ordinal reference support is incomplete",
            support,
          ),
    );
  }
  for (const facet of RATIONALE_FACETS) {
    const support = dimensions.stated_rationale_alignment.support[facet];
    checks.push(
      support.meetsMinimum
        ? pass(
            `support.stated_rationale_alignment.${facet}`,
            "all rationale facet levels and target outputs are available",
            support,
          )
        : fail(
            `support.stated_rationale_alignment.${facet}`,
            "rationale facet reference support is incomplete",
            support,
          ),
    );
  }

  const hardSupport = {
    total: dimensions.hard_constraint_violation.support.total,
    measured: dimensions.hard_constraint_violation.support.measured,
    positives: dimensions.hard_constraint_violation.support.positives,
    negatives: dimensions.hard_constraint_violation.support.negatives,
    conditions: Object.fromEntries(
      ["unconditioned", "target_a", "target_b"].map((condition) => {
        const values = plan.entries
          .filter(
            (entry) =>
              entry.dimension === "hard_constraint_violation" &&
              entry.condition === condition,
          )
          .map(
            (entry) => labelsById.get(entry.exampleId)?.hardConstraintViolation,
          );
        return [
          condition,
          {
            total: values.length,
            measured: values.filter((value) => value?.state === "measured")
              .length,
            positives: values.filter(
              (value) => value?.state === "measured" && value.detected === true,
            ).length,
            negatives: values.filter(
              (value) =>
                value?.state === "measured" && value.detected === false,
            ).length,
          },
        ];
      }),
    ),
    criticalRecallSupported:
      dimensions.hard_constraint_violation.support.positives >= 18,
    mccSupported:
      dimensions.hard_constraint_violation.support.positives >= 18 &&
      dimensions.hard_constraint_violation.support.negatives >= 126,
  };
  checks.push(
    hardSupport.measured === 144 &&
      hardSupport.positives === 18 &&
      hardSupport.negatives === 126
      ? pass(
          "support.hard_constraint_violation",
          "hard-constraint Judge has 18 positive and 126 negative references",
          hardSupport,
        )
      : fail(
          "support.hard_constraint_violation",
          "hard-constraint support must be 18 positive and 126 negative measured references",
          hardSupport,
        ),
  );

  const failed = checks.filter((check) => check.status === "failed");
  const semantic = {
    artifact_type: "qualification_readiness",
    readinessId: "luna-full-matrix-gate-preflight-2026.8.20",
    corpusDigest: corpus.manifest.corpusDigest,
    labelDigest: labelManifest.referenceLabelsDigest,
    measurementPlanDigest: plan.planDigest,
    gatePolicyId: gatePolicy.policyId,
    gatePolicyDigest: stableDigest(gatePolicy),
    publicBankDigest: bank.manifest.bankDigest,
    publicBankStatus: bank.manifest.status,
    corpusCensus: corpus.manifest.census,
    measurementCensus: plan.census,
    dimensions,
    hardConstraintSupport: hardSupport,
    statisticalPolicy: plan.policy,
    checks,
    status: failed.length === 0 ? "ready_for_new_baseline" : "blocked",
    nextAction:
      failed.length === 0
        ? "A full-matrix Luna baseline may be run later; this preflight did not call a provider."
        : "Resolve the listed readiness blockers before running a full-matrix baseline.",
  };
  return { ...semantic, readinessDigest: stableDigest(semantic) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.argv[2] ?? ".";
  const outputPath = join(root, "qualification/hill-climbing/readiness.json");
  const report = await buildQualificationReadiness(root);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ outputPath, ...report })}\n`);
  if (report.status !== "ready_for_new_baseline") process.exitCode = 1;
}

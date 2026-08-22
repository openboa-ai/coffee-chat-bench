#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

import { stableDigest } from "../src/contracts.ts";
import { validateQualificationCorpus } from "../src/qualification.ts";

const root = process.argv[2] ?? ".";
const corpusRoot = `${root}/qualification/corpus`;
const outputPath = `${root}/qualification/measurement-plan.json`;
const corpus = await validateQualificationCorpus(corpusRoot, `${root}/bank`);
const labels = (await readFile(`${corpusRoot}/reference-labels.jsonl`, "utf8"))
  .split(/\r?\n/u)
  .filter((line) => line.trim() !== "")
  .map((line) => JSON.parse(line));
const labelById = new Map(labels.map((label) => [label.exampleId, label]));

const dimensions = [
  "judgment_alignment",
  "stated_rationale_alignment",
  "task_performance",
  "evidence_grounding",
  "hard_constraint_violation",
];
const ordinalDimensions = [
  "judgment_alignment",
  "task_performance",
  "evidence_grounding",
];
const rationaleFacets = [
  "cueUtilization",
  "cueWeighting",
  "contextSensitivity",
  "actionConsistency",
];
const targetOnlyDimensions = [
  "judgment_alignment",
  "stated_rationale_alignment",
];
const ordinalLevels = [1, 2, 3, 4, 5];
const expectedDimensions = {
  judgment_alignment: 96,
  stated_rationale_alignment: 96,
  task_performance: 144,
  evidence_grounding: 144,
  hard_constraint_violation: 144,
};
const expectedConditions = {
  target_a: 240,
  target_b: 240,
  unconditioned: 144,
};
const applicableDimensions = {
  target_a: dimensions,
  target_b: dimensions,
  unconditioned: [
    "task_performance",
    "evidence_grounding",
    "hard_constraint_violation",
  ],
};
const submissionById = new Map(
  corpus.submissions.map((submission) => [submission.exampleId, submission]),
);

function measuredScore(reference) {
  return reference?.state === "measured" &&
    Number.isInteger(reference.score) &&
    ordinalLevels.includes(reference.score)
    ? reference.score
    : null;
}

function assertFullOrdinalCoverage(name, references) {
  const levels = [
    ...new Set(references.map(measuredScore).filter((score) => score !== null)),
  ].sort((left, right) => left - right);
  if (JSON.stringify(levels) !== JSON.stringify(ordinalLevels))
    throw new Error(
      `${name} must contain all ordinal levels 1-5; found ${JSON.stringify(levels)}`,
    );
}

function countBy(values) {
  return Object.fromEntries(
    Object.entries(Object.groupBy(values, (value) => value)).map(
      ([key, grouped]) => [key, grouped.length],
    ),
  );
}

const entries = [];
for (const submission of [...corpus.submissions].sort((left, right) =>
  left.exampleId.localeCompare(right.exampleId),
)) {
  for (const dimension of applicableDimensions[submission.condition]) {
    entries.push({
      exampleId: submission.exampleId,
      dimension,
      condition: submission.condition,
    });
  }
}

const actualDimensions = countBy(entries.map((entry) => entry.dimension));
const actualConditions = countBy(entries.map((entry) => entry.condition));
if (
  JSON.stringify(actualDimensions) !== JSON.stringify(expectedDimensions) ||
  JSON.stringify(actualConditions) !== JSON.stringify(expectedConditions)
)
  throw new Error(
    `full measurement census mismatch: dimensions=${JSON.stringify(actualDimensions)} conditions=${JSON.stringify(actualConditions)}`,
  );

const seen = new Set();
for (const entry of entries) {
  const key = `${entry.exampleId}\u0000${entry.dimension}`;
  if (seen.has(key)) throw new Error(`duplicate measurement row ${key}`);
  seen.add(key);
  const submission = submissionById.get(entry.exampleId);
  const label = labelById.get(entry.exampleId);
  if (!submission || !label)
    throw new Error(`missing submission or label for ${entry.exampleId}`);
  if (submission.condition !== entry.condition)
    throw new Error(`condition mismatch for ${entry.exampleId}`);
  const reference =
    label[
      {
        judgment_alignment: "judgmentAlignment",
        stated_rationale_alignment: "statedRationaleAlignment",
        task_performance: "taskPerformance",
        evidence_grounding: "evidenceGrounding",
        hard_constraint_violation: "hardConstraintViolation",
      }[entry.dimension]
    ];
  const shouldBeMeasured =
    !targetOnlyDimensions.includes(entry.dimension) ||
    submission.condition !== "unconditioned";
  if (shouldBeMeasured && reference?.state !== "measured")
    throw new Error(
      `${entry.dimension} is not measured for ${entry.exampleId}`,
    );
  if (!shouldBeMeasured && reference?.state !== "not_applicable")
    throw new Error(
      `${entry.dimension} must be not_applicable for ${entry.exampleId}`,
    );
}

for (const dimension of ordinalDimensions) {
  const key = {
    judgment_alignment: "judgmentAlignment",
    task_performance: "taskPerformance",
    evidence_grounding: "evidenceGrounding",
  }[dimension];
  assertFullOrdinalCoverage(
    dimension,
    entries
      .filter((entry) => entry.dimension === dimension)
      .map((entry) => labelById.get(entry.exampleId)?.[key]),
  );
}
for (const facet of rationaleFacets)
  assertFullOrdinalCoverage(
    `stated_rationale_alignment.${facet}`,
    entries
      .filter((entry) => entry.dimension === "stated_rationale_alignment")
      .map(
        (entry) =>
          labelById.get(entry.exampleId)?.statedRationaleAlignment?.[facet],
      ),
  );

const hardLabels = entries
  .filter((entry) => entry.dimension === "hard_constraint_violation")
  .map((entry) => labelById.get(entry.exampleId)?.hardConstraintViolation);
const hardConstraintSupport = {
  total: hardLabels.length,
  positives: hardLabels.filter((label) => label?.detected === true).length,
  negatives: hardLabels.filter((label) => label?.detected === false).length,
};
if (
  hardConstraintSupport.positives !== 18 ||
  hardConstraintSupport.negatives !== 126
)
  throw new Error(
    `full hard-constraint support mismatch: ${JSON.stringify(hardConstraintSupport)}`,
  );

const labelManifest = JSON.parse(
  await readFile(`${corpusRoot}/reference-labels-manifest.json`, "utf8"),
);
const semantic = {
  artifact_type: "qualification_measurement_plan",
  planId: "full-matrix-absolute-gate-2026.8.20",
  release: corpus.manifest.release,
  corpusDigest: corpus.manifest.corpusDigest,
  labelDigest: labelManifest.referenceLabelsDigest,
  entries,
  census: {
    total: entries.length,
    submissions: corpus.submissions.length,
    dimensions: actualDimensions,
    conditions: actualConditions,
  },
  hardConstraintSupport,
  policy: {
    measurement: "every applicable dimension for every qualification output",
    ordinalMinimumEligible: {
      judgment_alignment: 96,
      task_performance: 144,
      evidence_grounding: 144,
      rationaleFacet: 96,
    },
    minimumReferenceLevels: 5,
    bootstrapUnit: "familyVariantId",
    bootstrapResamples: 5000,
    confidenceLevel: 0.95,
  },
};
const output = { ...semantic, planDigest: stableDigest(semantic) };
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(
  `${JSON.stringify({ outputPath, planDigest: output.planDigest, census: output.census, hardConstraintSupport })}\n`,
);

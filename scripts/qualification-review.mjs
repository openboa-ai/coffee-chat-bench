import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { validateQualificationCorpus } from "../src/qualification.ts";

const corpusRoot = process.argv[2] ?? "qualification/corpus";
const outputPath = process.argv[3] ?? `${corpusRoot}/review.csv`;
const corpus = await validateQualificationCorpus(corpusRoot, "bank");
const labels = corpus.referenceLabelsPresent
  ? (await readFile(join(corpusRoot, "reference-labels.jsonl"), "utf8"))
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line))
  : [];
const labelByExample = new Map(labels.map((label) => [label.exampleId, label]));

function csv(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

const header = [
  "example_id",
  "family_variant_id",
  "source_case_id",
  "condition",
  "label_authority",
  "label_review_state",
  "judgment_alignment_state",
  "judgment_alignment_score",
  "judgment_alignment_confidence",
  "judgment_alignment_rationale",
  "cue_utilization_score",
  "cue_utilization_confidence",
  "cue_weighting_score",
  "cue_weighting_confidence",
  "context_sensitivity_score",
  "context_sensitivity_confidence",
  "action_consistency_score",
  "action_consistency_confidence",
  "task_performance_score",
  "task_performance_confidence",
  "task_performance_rationale",
  "evidence_grounding_score",
  "evidence_grounding_confidence",
  "evidence_grounding_rationale",
  "hard_constraint_state",
  "hard_constraint_violation",
  "hard_constraint_confidence",
  "hard_constraint_rationale",
  "artifact",
  "decision_record",
];

const value = (reference, field) =>
  reference?.state === "measured" ? (reference[field] ?? "") : "not_applicable";
const rows = corpus.submissions.map((submission) => {
  const label = labelByExample.get(submission.exampleId);
  const rationale = label?.statedRationaleAlignment;
  const judgment = label?.judgmentAlignment;
  const task = label?.taskPerformance;
  const evidence = label?.evidenceGrounding;
  const hard = label?.hardConstraintViolation;
  return [
    submission.exampleId,
    submission.familyVariantId,
    submission.sourceCaseId,
    submission.condition,
    label?.authority ?? "",
    label?.reviewState ?? "",
    judgment?.state ?? "",
    value(judgment, "score"),
    value(judgment, "confidence"),
    value(judgment, "rationale"),
    value(rationale?.cueUtilization, "score"),
    value(rationale?.cueUtilization, "confidence"),
    value(rationale?.cueWeighting, "score"),
    value(rationale?.cueWeighting, "confidence"),
    value(rationale?.contextSensitivity, "score"),
    value(rationale?.contextSensitivity, "confidence"),
    value(rationale?.actionConsistency, "score"),
    value(rationale?.actionConsistency, "confidence"),
    value(task, "score"),
    value(task, "confidence"),
    value(task, "rationale"),
    value(evidence, "score"),
    value(evidence, "confidence"),
    value(evidence, "rationale"),
    hard?.state ?? "",
    hard?.state === "measured" ? String(hard.detected) : "abstained",
    value(hard, "confidence"),
    value(hard, "rationale"),
    submission.candidateSubmission.artifact.content,
    submission.candidateSubmission.decisionRecord,
  ]
    .map(csv)
    .join(",");
});

await writeFile(
  outputPath,
  `${[header.join(","), ...rows].join("\n")}\n`,
  "utf8",
);
console.log(outputPath);

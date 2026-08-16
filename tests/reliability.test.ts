import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { validateBank } from "../src/bank.ts";
import { stableDigest } from "../src/contracts.ts";
import {
  createHumanAnnotation,
  deriveHumanCriterion,
  parseQualificationStudy,
  projectAnnotationAssignments,
  qualificationItems,
  type AnnotationAssignment,
  type HumanAnnotationRecord,
  type QualificationItem,
} from "../src/qualification.ts";
import { deriveReliabilityReport } from "../src/reliability.ts";

async function fixture() {
  const bank = await validateBank(resolve("bank"));
  const study = parseQualificationStudy(
    JSON.parse(
      await readFile(resolve("qualification/study.json"), "utf8"),
    ) as unknown,
    bank,
  );
  return {
    bank,
    study,
    items: qualificationItems(study, bank),
    assignments: projectAnnotationAssignments(study, bank),
  };
}

function records(
  study: Awaited<ReturnType<typeof fixture>>["study"],
  items: readonly QualificationItem[],
  assignments: readonly AnnotationAssignment[],
  mutate: (
    item: QualificationItem,
    assignment: AnnotationAssignment,
    verdict: QualificationItem["constructionHypothesis"],
  ) => QualificationItem["constructionHypothesis"] | "abstain" = (
    _item,
    _assignment,
    verdict,
  ) => verdict,
): HumanAnnotationRecord[] {
  const byBlindId = new Map(items.map((item) => [item.blindItemId, item]));
  return assignments.flatMap((assignment) =>
    assignment.items.map((projected) => {
      const item = byBlindId.get(projected.blindItemId)!;
      const verdict = mutate(item, assignment, item.constructionHypothesis);
      return createHumanAnnotation(assignment, projected, {
        annotatorDigest: stableDigest({
          study: study.studyDigest,
          group: assignment.groupId,
        }),
        attestation: {
          human: true,
          independent: true,
          bankAuthor: false,
          artifactAuthor: false,
          evaluatorMaterialsAccessed: false,
          protocolRead: true,
        },
        ...(verdict === "abstain"
          ? { state: "abstained" as const, cause: "criterion ambiguous" }
          : { state: "measured" as const, verdict }),
      });
    }),
  );
}

test("reliability report is cell-level, digest-bound, and preserves missingness", async () => {
  const { bank, study, items, assignments } = await fixture();
  const report = deriveReliabilityReport(
    study,
    bank,
    records(study, items, assignments),
  );

  assert.equal(report.state, "complete");
  assert.equal(report.cells.length, 12);
  assert.ok(report.cells.every((cell) => cell.plannedItems > 0));
  assert.ok(
    report.cells.every((cell) => cell.rawAgreement.state === "measured"),
  );
  assert.ok(report.cells.some((cell) => cell.alpha.state === "measured"));
  assert.ok(
    report.cells.every(
      (cell) =>
        cell.alpha.state === "measured" ||
        cell.alpha.reason === "zero_expected_disagreement",
    ),
  );
  assert.equal(
    report.evidenceDigest,
    stableDigest({
      release: report.release,
      method: report.method,
      studyDigest: report.studyDigest,
      criterionDigest: report.criterionDigest,
      state: report.state,
      cells: report.cells,
    }),
  );

  const target =
    items.find(
      (item) => item.orientation === "mirrored" && item.mode === "pairwise",
    ) ?? items[0]!;
  let seen = 0;
  const changed = records(
    study,
    items,
    assignments,
    (item, _assignment, expected) => {
      if (item.blindItemId !== target.blindItemId) return expected;
      seen += 1;
      if (seen === 1) return "abstain";
      if (seen === 2) return expected;
      if (item.mode === "pointwise")
        return expected === "pass" ? "fail" : "pass";
      return expected === "left" ? "right" : "left";
    },
  );
  const changedReport = deriveReliabilityReport(study, bank, changed);
  const targetCell = changedReport.cells.find(
    (cell) => cell.mode === target.mode && cell.dimension === target.dimension,
  )!;
  assert.equal(targetCell.abstainedLabels, 1);
  assert.ok(targetCell.disagreementItems >= 1);
  assert.equal(targetCell.completeItems, targetCell.plannedItems);

  const empty = deriveReliabilityReport(study, bank, []);
  assert.equal(empty.state, "incomplete");
  assert.ok(
    empty.cells.every((cell) => cell.missingItems === cell.plannedItems),
  );
  assert.ok(
    empty.cells.every(
      (cell) =>
        cell.alpha.state === "not_estimable" &&
        cell.alpha.reason === "no_comparable_pairs",
    ),
  );

  const criterion = deriveHumanCriterion(study, bank, []);
  assert.equal(criterion.state, "incomplete");
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { validateBank } from "../src/bank.ts";
import {
  APPROVED_JUDGE_MODELS,
  CROSS_VALIDATION_JUDGE_MODELS,
  PRIMARY_JUDGE_MODELS,
  stableDigest,
} from "../src/contracts.ts";
import {
  createHumanAnnotation,
  createQualificationVote,
  createQualifiedJudgeConfiguration,
  deriveHumanCriterion,
  deriveJudgeQualifications,
  parseQualificationStudy,
  projectAnnotationAssignments,
  qualificationItems,
  type AnnotationAssignment,
  type HumanAnnotationRecord,
  type QualificationItem,
} from "../src/qualification.ts";

async function fixture() {
  const bank = await validateBank(resolve("bank"));
  const study = parseQualificationStudy(
    JSON.parse(
      await readFile(resolve("qualification/study.json"), "utf8"),
    ) as unknown,
    bank,
  );
  const items = qualificationItems(study, bank);
  const assignments = projectAnnotationAssignments(study, bank);
  return { bank, study, items, assignments };
}

function annotationRecords(
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

test("public qualification study binds the bank and emits blinded balanced assignments", async () => {
  const { bank, study, items, assignments } = await fixture();

  assert.deepEqual(APPROVED_JUDGE_MODELS, [
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    "gpt-5.6-sol",
  ]);
  assert.equal(study.artifacts.length, 32);
  assert.equal(items.length, 88);
  assert.equal(assignments.length, 6);
  assert.ok(
    study.artifacts.every((artifact) =>
      bank.cases.some(
        ({ manifest }) =>
          manifest.caseId === artifact.caseId &&
          manifest.split === "judge_qualification",
      ),
    ),
  );

  const assignmentCount = new Map<string, number>();
  for (const assignment of assignments) {
    assert.deepEqual(Object.keys(assignment).sort(), [
      "assignmentDigest",
      "groupId",
      "items",
      "protocol",
      "release",
      "studyDigest",
      "studyId",
    ]);
    for (const item of assignment.items) {
      assignmentCount.set(
        item.blindItemId,
        (assignmentCount.get(item.blindItemId) ?? 0) + 1,
      );
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
      assert.equal("condition" in item, false);
      assert.equal("constructionHypothesis" in item, false);
      assert.equal("generator" in item, false);
      assert.equal("caseId" in item, false);
    }
  }
  assert.ok([...assignmentCount.values()].every((count) => count === 3));
  assert.ok(
    Math.max(...assignments.map(({ items }) => items.length)) -
      Math.min(...assignments.map(({ items }) => items.length)) <=
      4,
  );
  assert.deepEqual(
    projectAnnotationAssignments(study, bank),
    projectAnnotationAssignments(study, bank),
  );

  for (const [pairId, pairItems] of Map.groupBy(
    items.filter((item) => item.pairId !== null),
    (item) => item.pairId!,
  )) {
    const canonical = pairItems.find(
      (item) => item.orientation === "canonical",
    );
    const mirrored = pairItems.find((item) => item.orientation === "mirrored");
    assert.ok(canonical && mirrored, pairId);
    assert.equal(
      canonical.assignmentGroups.some((group) =>
        mirrored.assignmentGroups.includes(group),
      ),
      false,
      pairId,
    );
  }

  const raw = JSON.parse(
    await readFile(resolve("qualification/study.json"), "utf8"),
  ) as any;
  const derived = raw.artifacts.find(
    (artifact: any) => artifact.variant !== "base",
  );
  derived.derivedFrom = raw.artifacts.find(
    (artifact: any) => artifact.variant !== "base" && artifact !== derived,
  ).artifactId;
  const { studyDigest: _digest, ...semantic } = raw;
  raw.studyDigest = stableDigest(semantic);
  assert.throws(
    () => parseQualificationStudy(raw, bank),
    /base artifact|derived/i,
  );

  const pairRaw = JSON.parse(
    await readFile(resolve("qualification/study.json"), "utf8"),
  ) as any;
  const pairedItem = pairRaw.extraItems.find(
    (item: any) => item.pairId !== null,
  );
  const pair = pairRaw.extraItems.filter(
    (item: any) => item.pairId === pairedItem.pairId,
  );
  pair[1].artifactIds = pair[0].artifactIds;
  const { studyDigest: _pairDigest, ...pairSemantic } = pairRaw;
  pairRaw.studyDigest = stableDigest(pairSemantic);
  assert.throws(
    () => parseQualificationStudy(pairRaw, bank),
    /exact mirrored presentation/i,
  );

  const weakened = JSON.parse(
    await readFile(resolve("qualification/study.json"), "utf8"),
  ) as any;
  weakened.thresholds.minimumOverallAccuracy = 0;
  const { studyDigest: _weakenedDigest, ...weakenedSemantic } = weakened;
  weakened.studyDigest = stableDigest(weakenedSemantic);
  assert.throws(
    () => parseQualificationStudy(weakened, bank),
    /frozen bank\/protocol/i,
  );
});

test("human criterion preserves missing, abstention, disagreement, and false attestation", async () => {
  const { bank, study, items, assignments } = await fixture();
  const empty = deriveHumanCriterion(study, bank, []);
  assert.equal(empty.state, "incomplete");
  assert.deepEqual(empty.coverage, {
    measured: 0,
    planned: 88,
    value: 0,
  });

  const target = items[0]!;
  let seen = 0;
  const ambiguousRecords = annotationRecords(
    study,
    items,
    assignments,
    (item, _assignment, verdict) => {
      if (item.blindItemId !== target.blindItemId) return "abstain";
      seen += 1;
      if (seen === 3)
        return item.mode === "pointwise"
          ? verdict === "pass"
            ? "fail"
            : "pass"
          : verdict === "left"
            ? "right"
            : "left";
      return verdict;
    },
  );
  const ambiguous = deriveHumanCriterion(study, bank, ambiguousRecords);
  assert.equal(
    ambiguous.references.find(
      ({ blindItemId }) => blindItemId === target.blindItemId,
    )!.state,
    "ambiguous",
  );
  assert.equal(ambiguous.state, "incomplete");

  const promptInjection = items.find((item) =>
    item.strata.includes("prompt_injection"),
  )!;
  const canaryMissing = deriveHumanCriterion(
    study,
    bank,
    annotationRecords(
      study,
      items,
      assignments,
      (item, _assignment, expected) =>
        item.blindItemId === promptInjection.blindItemId ? "abstain" : expected,
    ),
  );
  assert.equal(canaryMissing.state, "incomplete");

  const pair = items.find(
    (item) => item.orientation === "mirrored" && item.mode === "pairwise",
  )!;
  const orientationRecords = annotationRecords(
    study,
    items,
    assignments,
    (item, _assignment, expected) =>
      item.blindItemId === pair.blindItemId
        ? expected === "left"
          ? "right"
          : "left"
        : expected,
  );
  const orientationCriterion = deriveHumanCriterion(
    study,
    bank,
    orientationRecords,
  );
  assert.ok(
    orientationCriterion.references
      .filter(({ pairId }) => pairId === pair.pairId)
      .every(({ state }) => state === "ambiguous"),
  );

  const assignment = assignments.find((entry) => entry.items.length > 0)!;
  const projected = assignment.items[0]!;
  assert.throws(
    () =>
      createHumanAnnotation(assignment, projected, {
        annotatorDigest: stableDigest("not-human"),
        attestation: {
          human: false,
          independent: true,
          bankAuthor: false,
          artifactAuthor: false,
          evaluatorMaterialsAccessed: false,
          protocolRead: true,
        },
        state: "abstained",
        cause: "not a human annotation",
      }),
    /human attestation/i,
  );
});

test("only human-referenced, exact-model, threshold-passing judges qualify", async () => {
  const { bank, study, items, assignments } = await fixture();
  const annotations = annotationRecords(study, items, assignments);
  const criterion = deriveHumanCriterion(study, bank, annotations);
  assert.equal(criterion.state, "ready");
  assert.deepEqual(criterion.coverage, {
    measured: 88,
    planned: 88,
    value: 1,
  });

  const votes = criterion.references.flatMap((reference) => {
    assert.equal(reference.state, "measured");
    if (reference.state !== "measured") return [];
    return APPROVED_JUDGE_MODELS.map((model) =>
      createQualificationVote(study, reference, {
        model,
        state: "measured",
        resolvedModel: model,
        promptDigest: reference.judgePromptDigest,
        responseDigest: stableDigest({
          model,
          item: reference.blindItemId,
          verdict: reference.verdict,
        }),
        verdict: reference.verdict,
        usage: null,
      }),
    );
  });
  const qualified = deriveJudgeQualifications(study, bank, annotations, votes);
  assert.equal(qualified.state, "qualified");
  assert.equal(qualified.protocol, study.protocol);
  assert.ok(
    qualified.models.every(
      ({ state, overall }) =>
        state === "qualified" &&
        overall.state === "measured" &&
        overall.value === 1,
    ),
  );
  const configuration = createQualifiedJudgeConfiguration(qualified);
  assert.equal(configuration.studyDigest, study.studyDigest);
  assert.deepEqual(configuration.primaryJudges, PRIMARY_JUDGE_MODELS);
  assert.deepEqual(
    configuration.crossValidationJudges,
    CROSS_VALIDATION_JUDGE_MODELS,
  );
  assert.ok(
    APPROVED_JUDGE_MODELS.every(
      (model) =>
        configuration.qualifications[model].qualificationEvidenceDigest ===
        qualified.models.find((item) => item.model === model)!.evidenceDigest,
    ),
  );
  const firstMeasured = criterion.references.find(
    (reference) => reference.state === "measured",
  )!;
  assert.equal(firstMeasured.state, "measured");
  if (firstMeasured.state !== "measured") throw new Error("fixture incomplete");
  assert.throws(
    () =>
      createQualificationVote(study, firstMeasured, {
        model: "gpt-5.6-terra",
        state: "measured",
        resolvedModel: "gpt-5.6-terra",
        promptDigest: stableDigest("different prompt"),
        responseDigest: stableDigest("response"),
        verdict: firstMeasured.verdict,
        usage: null,
      }),
    /frozen judge prompt/i,
  );
  assert.throws(
    () =>
      createQualificationVote(study, firstMeasured, {
        model: "gpt-5.6-terra",
        state: "measured",
        resolvedModel: "gpt-5.6-terra",
        promptDigest: firstMeasured.judgePromptDigest,
        responseDigest: null,
        verdict: firstMeasured.verdict,
        usage: null,
      }),
    /response digest/i,
  );
  assert.throws(
    () =>
      deriveJudgeQualifications(study, bank, annotations, [
        { ...votes[0]!, undeclared: true } as any,
      ]),
    /exactly|contain/i,
  );

  assert.throws(
    () =>
      deriveHumanCriterion(study, bank, [
        {
          ...annotations[0]!,
          undeclared: true,
        } as unknown as HumanAnnotationRecord,
      ]),
    /exactly|contain/i,
  );

  const critical = criterion.references.find(
    (reference) =>
      reference.state === "measured" &&
      reference.dimension === "critical_failure",
  )!;
  assert.equal(critical.state, "measured");
  if (critical.state !== "measured") throw new Error("fixture incomplete");
  const failedVotes = votes.map((vote) =>
    vote.model === "gpt-5.6-luna" && vote.blindItemId === critical.blindItemId
      ? createQualificationVote(study, critical, {
          model: vote.model,
          state: "measured",
          resolvedModel: vote.model,
          promptDigest: vote.promptDigest,
          responseDigest: stableDigest({ wrong: vote.responseDigest }),
          verdict: critical.verdict === "pass" ? "fail" : "pass",
          usage: null,
        })
      : vote,
  );
  const notQualified = deriveJudgeQualifications(
    study,
    bank,
    annotations,
    failedVotes,
  );
  assert.equal(notQualified.state, "not_qualified");
  assert.equal(
    notQualified.models.find(({ model }) => model === "gpt-5.6-luna")!.state,
    "not_qualified",
  );

  const mirrored = criterion.references.find(
    (reference) =>
      reference.state === "measured" &&
      reference.mode === "pairwise" &&
      reference.orientation === "mirrored",
  )!;
  assert.equal(mirrored.state, "measured");
  if (mirrored.state !== "measured") throw new Error("fixture incomplete");
  const positionBiasedVotes = votes.map((vote) =>
    vote.model === "gpt-5.6-luna" && vote.blindItemId === mirrored.blindItemId
      ? createQualificationVote(study, mirrored, {
          model: vote.model,
          state: "measured",
          resolvedModel: vote.model,
          promptDigest: vote.promptDigest,
          responseDigest: stableDigest({ positionBias: vote.responseDigest }),
          verdict: mirrored.verdict === "left" ? "right" : "left",
          usage: null,
        })
      : vote,
  );
  const positionBiased = deriveJudgeQualifications(
    study,
    bank,
    annotations,
    positionBiasedVotes,
  );
  const biasedLuna = positionBiased.models.find(
    ({ model }) => model === "gpt-5.6-luna",
  )!;
  assert.equal(biasedLuna.state, "not_qualified");
  assert.equal(biasedLuna.orientationFailures.length, 1);

  const firstTerra = votes.find(({ model }) => model === "gpt-5.6-terra")!;
  const firstReference = criterion.references.find(
    ({ blindItemId }) => blindItemId === firstTerra.blindItemId,
  )!;
  assert.equal(firstReference.state, "measured");
  if (firstReference.state !== "measured")
    throw new Error("fixture incomplete");
  const drifted = votes.map((vote) =>
    vote === firstTerra
      ? createQualificationVote(study, firstReference, {
          model: vote.model,
          state: "measured",
          resolvedModel: `${vote.model}-drifted`,
          promptDigest: vote.promptDigest,
          responseDigest: vote.responseDigest,
          verdict: firstReference.verdict,
          usage: null,
        })
      : vote,
  );
  const unavailable = deriveJudgeQualifications(
    study,
    bank,
    annotations,
    drifted,
  );
  assert.equal(unavailable.state, "unavailable");

  const noHumanEvidence = deriveJudgeQualifications(study, bank, [], []);
  assert.equal(noHumanEvidence.state, "unavailable");
});

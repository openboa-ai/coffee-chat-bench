import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateQualificationCorpus } from "../src/qualification.ts";

const stressCaseIds = [
  "pair-01-fund-commitment-window",
  "pair-02-learning-platform-contract",
  "pair-02-river-monitoring-commitment",
  "pair-03-incident-command-handoffs",
  "pair-03-regional-intake-variants",
  "pair-04-accessibility-exam-rule",
  "pair-04-marketplace-ranking-review",
  "pair-05-lab-throughput-risk",
  "pair-05-release-capacity-margin",
  "pair-06-live-search-layout",
  "pair-06-source-authentication-gate",
  "pair-07-certified-repair-deadline",
  "pair-07-community-grant-administration",
  "pair-07-editorial-research-capability",
  "pair-08-portfolio-summary-language",
  "pair-08-statutory-policy-notice",
].sort();

const readJsonl = async (path: string) =>
  (await readFile(path, "utf8"))
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as Record<string, any>);

test("the qualification corpus freezes 144 agent submissions in one public-bank-independent corpus", async () => {
  const corpus = await validateQualificationCorpus(
    "qualification/corpus",
    "bank",
  );

  assert.equal(corpus.manifest.status, "output_corpus_frozen");
  assert.equal(corpus.manifest.census.familyVariants, 48);
  assert.equal(corpus.manifest.census.submissions, 144);
  assert.deepEqual(corpus.manifest.census.conditions, {
    target_a: 48,
    target_b: 48,
    unconditioned: 48,
  });
  assert.deepEqual([...corpus.manifest.stressCaseIds].sort(), stressCaseIds);
  assert.equal(corpus.submissions.length, 144);
  assert.equal(corpus.familyVariants.length, 48);
  assert.equal(corpus.referenceLabelsPresent, true);
  assert.equal(
    Object.values(corpus.constructionIntentCounts).reduce(
      (total, count) => total + count,
      0,
    ),
    144,
  );
});

test("pointwise references map once to every frozen submission without entering Judge-facing data", async () => {
  const corpus = await validateQualificationCorpus(
    "qualification/corpus",
    "bank",
  );
  const labels = await readJsonl("qualification/corpus/reference-labels.jsonl");
  const byExample = new Map(
    corpus.submissions.map((submission) => [submission.exampleId, submission]),
  );

  assert.equal(labels.length, 144);
  assert.equal(new Set(labels.map(({ exampleId }) => exampleId)).size, 144);
  for (const label of labels) {
    const submission = byExample.get(label.exampleId);
    assert.ok(submission, `unknown label example ${label.exampleId}`);
    assert.equal(label.kind, "pointwise_reference");
    assert.equal(label.authority, "model_authored_draft");
    assert.equal(label.reviewState, "pending_project_owner_review");
    assert.equal(label.submissionDigest, submission.submissionDigest);
    assert.equal(label.condition, submission.condition);
    const targetRelative = submission.condition !== "unconditioned";
    assert.equal(label.judgmentAlignment.state === "measured", targetRelative);
    assert.equal(
      label.statedRationaleAlignment.state === "measured",
      targetRelative,
    );
    for (const reference of [
      label.judgmentAlignment,
      label.taskPerformance,
      label.evidenceGrounding,
    ]) {
      if (reference.state === "measured") {
        assert.ok(reference.score >= 1 && reference.score <= 5);
        assert.match(reference.confidence, /^(high|medium|low)$/u);
        assert.equal(typeof reference.rationale, "string");
      }
    }
    if (label.statedRationaleAlignment.state === "measured") {
      for (const facet of [
        "cueUtilization",
        "cueWeighting",
        "contextSensitivity",
        "actionConsistency",
      ]) {
        const reference = label.statedRationaleAlignment[facet];
        assert.equal(reference.state, "measured");
        assert.ok(reference.score >= 1 && reference.score <= 5);
        assert.match(reference.confidence, /^(high|medium|low)$/u);
      }
    }
    assert.equal(label.hardConstraintViolation.state, "measured");
    assert.equal(typeof label.hardConstraintViolation.detected, "boolean");
  }
});

test("all 32 public cases have one base trio and the fixed 16 stress cases have one alternative trio", async () => {
  const corpus = await validateQualificationCorpus(
    "qualification/corpus",
    "bank",
  );

  const base = corpus.familyVariants.filter(
    ({ variant }) => variant === "base",
  );
  const stress = corpus.familyVariants.filter(
    ({ variant }) => variant === "stress",
  );
  assert.equal(base.length, 32);
  assert.equal(stress.length, 16);
  assert.equal(new Set(base.map(({ sourceCaseId }) => sourceCaseId)).size, 32);
  assert.deepEqual(
    stress.map(({ sourceCaseId }) => sourceCaseId).sort(),
    stressCaseIds,
  );
  assert.ok(
    corpus.familyVariants.every(
      ({ submissions }) =>
        submissions.length === 3 &&
        new Set(submissions.map(({ condition }) => condition)).size === 3,
    ),
  );
});

test("construction metadata and reference labels never enter Judge-facing submissions", async () => {
  const corpus = await validateQualificationCorpus(
    "qualification/corpus",
    "bank",
  );
  const serialized = JSON.stringify(corpus.submissions);

  assert.doesNotMatch(
    serialized,
    /expected[_-]?score|reference[_-]?label|quality[_-]?profile|construction[_-]?intent|variant[_-]?role|label[_-]?certainty/iu,
  );
  assert.ok(
    corpus.submissions.every(({ validation }) => validation.state === "valid"),
  );
});

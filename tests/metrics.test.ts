import assert from "node:assert/strict";
import test from "node:test";

import type {
  CaseBundle,
  DecisionManifest,
  ResultState,
  TrialVerdict,
} from "../src/contracts.ts";
import {
  aggregateBenchmark,
  qualifyFamily,
  qualifyTrial,
} from "../src/metrics.ts";
import type { FamilyVerdict } from "../src/metrics.ts";
import { stableDigest } from "../src/digest.ts";

const digest = `sha256:${"a".repeat(64)}` as const;

const calendarContent =
  "The optional meeting overlaps a protected focus block.";
const notesContent = "The deadline may move only with explicit approval.";
const perspectiveAContent = "Protect focus when deadlines are near.";
const perspectiveBContent =
  "Coordinate synchronously when alignment risk is high.";
const irrelevantPerspectiveContent = "Prefer concise weekly written updates.";

const caseSemanticFields = {
  release: "2026.8.12",
  caseId: "case-alpha",
  familyId: "family-alpha",
  domain: "workplace",
  operation: "prioritize",
  difficulty: "standard",
  task: {
    instruction: "Choose one region for each decision.",
    deliverable: "Return the declared decision manifest.",
  },
  evidence: [
    {
      ref: "source-calendar",
      content: calendarContent,
      digest: stableDigest(calendarContent),
    },
    {
      ref: "source-notes",
      content: notesContent,
      digest: stableDigest(notesContent),
    },
  ],
  perspectives: {
    A: {
      id: "perspective-alpha-a",
      pairId: "perspective-pair-alpha",
      content: perspectiveAContent,
      digest: stableDigest(perspectiveAContent),
    },
    B: {
      id: "perspective-alpha-b",
      pairId: "perspective-pair-alpha",
      content: perspectiveBContent,
      digest: stableDigest(perspectiveBContent),
    },
    irrelevant: {
      id: "perspective-unrelated",
      pairId: "perspective-pair-unrelated",
      content: irrelevantPerspectiveContent,
      digest: stableDigest(irrelevantPerspectiveContent),
    },
  },
  decisions: [
    {
      decisionId: "decision-focus",
      prompt: "How should the optional meeting and focus block be handled?",
      regionOptions: ["neutral", "protect-focus", "attend-meeting"],
      partition: "sensitive",
      acceptedRegions: {
        T0: ["neutral"],
        "T1-A": ["protect-focus"],
        "T1-B": ["attend-meeting"],
      },
      requiredEvidenceRefs: ["source-calendar"],
    },
    {
      decisionId: "decision-deadline",
      prompt: "How should the deadline be handled?",
      regionOptions: ["keep-deadline", "approved-change"],
      partition: "invariant",
      acceptedRegions: {
        T0: ["keep-deadline", "approved-change"],
        "T1-A": ["keep-deadline", "approved-change"],
        "T1-B": ["keep-deadline", "approved-change"],
      },
      requiredEvidenceRefs: ["source-notes"],
    },
  ],
  nonGoal: "Predict a real person's behavior.",
} as const;
const caseBundle: CaseBundle = {
  ...caseSemanticFields,
  sourceDigest: stableDigest(caseSemanticFields),
};

const dimensions = {
  taskAdequate: true,
  evidenceIntegrity: true,
  perspectiveAligned: true,
  invariantsPreserved: true,
  criticalFailure: false,
} as const;

const aggregateFamily: FamilyVerdict = {
  release: "2026.8.12",
  familyId: "family-aggregate",
  domain: "workplace",
  operation: "prioritize",
  state: "measured",
  qualified: true,
  conditionLabels: ["T1-A", "T1-B"],
  sensitiveContrast: true,
  invariantsPreserved: true,
  criticalFailure: false,
  trialStateCounts: { measured: 2 },
  efficiency: [],
};

function manifest(
  condition: "T1-A" | "T1-B",
  trialDigit: string,
  focus: string,
  deadline = "keep-deadline",
): DecisionManifest {
  return {
    release: "2026.8.12",
    trialId: `trial-${trialDigit.repeat(64)}`,
    caseId: "case-alpha",
    condition,
    artifactDigest: digest,
    decisions: [
      {
        decisionId: "decision-focus",
        selectedRegion: focus,
        evidenceRefs: ["source-calendar"],
      },
      {
        decisionId: "decision-deadline",
        selectedRegion: deadline,
        evidenceRefs: ["source-notes"],
      },
    ],
  };
}

function measuredTrial(
  candidateManifest: DecisionManifest,
  criticalFailure = false,
): TrialVerdict {
  return qualifyTrial({
    state: "measured",
    trialId: candidateManifest.trialId,
    condition: candidateManifest.condition,
    caseBundle,
    manifest: candidateManifest,
    assessment: {
      dimensions: { ...dimensions, criticalFailure },
      evidenceRefs: ["source-calendar", "source-notes"],
    },
    efficiency: { wallTimeMs: 100, inputTokens: 20, outputTokens: 10 },
  });
}

test("trial qualification is conjunctive and critical failures cannot compensate", () => {
  const passing = measuredTrial(manifest("T1-A", "1", "protect-focus"));
  const critical = measuredTrial(manifest("T1-A", "2", "protect-focus"), true);
  const completeManifest = manifest("T1-A", "3", "protect-focus");
  const deadlineDecision = completeManifest.decisions[1];
  assert.ok(deadlineDecision);
  const missingEvidence = qualifyTrial({
    state: "measured",
    trialId: `trial-${"3".repeat(64)}`,
    condition: "T1-A",
    caseBundle,
    manifest: {
      ...manifest("T1-A", "3", "protect-focus"),
      decisions: [
        {
          decisionId: "decision-focus",
          selectedRegion: "protect-focus",
          evidenceRefs: [],
        },
        deadlineDecision,
      ],
    },
    assessment: {
      dimensions,
      evidenceRefs: ["source-calendar", "source-notes"],
    },
  });

  assert.equal(passing.qualified, true);
  assert.equal(critical.qualified, false);
  assert.equal(critical.criticalFailure, true);
  assert.equal(missingEvidence.qualified, false);
});

test("every non-measured result state remains distinct and out of qualification", () => {
  const states: readonly Exclude<ResultState, "measured">[] = [
    "candidate_invalid",
    "candidate_failure",
    "host_failure",
    "verifier_failure",
    "judge_disagreement",
    "judge_unavailable",
    "skipped",
    "unavailable",
    "unmeasured",
  ];

  for (const [index, state] of states.entries()) {
    const verdict = qualifyTrial({
      state,
      trialId: `trial-${String(index + 1).repeat(64)}`,
      condition: "T0",
      caseBundle,
      evidenceRefs: [`fixture://${state}`],
    });
    assert.equal(verdict.state, state);
    assert.equal(verdict.qualified, null);
  }
});

test("family qualification requires the A/B shift and invariant preservation", () => {
  const a = measuredTrial(manifest("T1-A", "4", "protect-focus"));
  const b = measuredTrial(manifest("T1-B", "5", "attend-meeting"));
  const changedInvariant = measuredTrial(
    manifest("T1-B", "6", "attend-meeting", "approved-change"),
  );

  const passing = qualifyFamily({ caseBundle, trials: [a, b] });
  const failing = qualifyFamily({
    caseBundle,
    trials: [a, changedInvariant],
  });

  assert.equal(passing.state, "measured");
  assert.equal(passing.qualified, true);
  assert.equal(passing.sensitiveContrast, true);
  assert.equal(passing.invariantsPreserved, true);
  assert.equal(failing.qualified, false);
  assert.equal(failing.invariantsPreserved, false);
});

test("aggregation reports separate macro QPCFR, clustered fixtures, and efficiency", () => {
  const families = [
    {
      release: "2026.8.12",
      familyId: "family-1",
      domain: "finance",
      operation: "summarize",
      state: "measured",
      qualified: true,
      conditionLabels: ["T1-A", "T1-B"],
      sensitiveContrast: true,
      invariantsPreserved: true,
      criticalFailure: false,
      trialStateCounts: { measured: 2 },
      efficiency: [{ wallTimeMs: 100, inputTokens: 10, outputTokens: 5 }],
    },
    {
      release: "2026.8.12",
      familyId: "family-2",
      domain: "finance",
      operation: "rank",
      state: "measured",
      qualified: false,
      conditionLabels: ["T1-A", "T1-B"],
      sensitiveContrast: false,
      invariantsPreserved: true,
      criticalFailure: false,
      trialStateCounts: { measured: 2 },
      efficiency: [{ wallTimeMs: 200, inputTokens: 20, outputTokens: 10 }],
    },
    {
      release: "2026.8.12",
      familyId: "family-3",
      domain: "travel",
      operation: "summarize",
      state: "measured",
      qualified: true,
      conditionLabels: ["T1-A", "T1-B"],
      sensitiveContrast: true,
      invariantsPreserved: true,
      criticalFailure: false,
      trialStateCounts: { measured: 2 },
      efficiency: [{ wallTimeMs: 300, inputTokens: 30, outputTokens: 15 }],
    },
    {
      release: "2026.8.12",
      familyId: "family-4",
      domain: "travel",
      operation: "rank",
      state: "measured",
      qualified: false,
      conditionLabels: ["T1-A", "T1-B"],
      sensitiveContrast: true,
      invariantsPreserved: false,
      criticalFailure: false,
      trialStateCounts: { measured: 2 },
      efficiency: [{ wallTimeMs: 400, inputTokens: 40, outputTokens: 20 }],
    },
    {
      release: "2026.8.12",
      familyId: "family-5",
      domain: "travel",
      operation: "rank",
      state: "unmeasured",
      qualified: null,
      conditionLabels: ["T1-A", "T1-B"],
      sensitiveContrast: null,
      invariantsPreserved: null,
      criticalFailure: null,
      trialStateCounts: { unmeasured: 2 },
      efficiency: [],
    },
  ] as const;

  const report = aggregateBenchmark({
    release: "2026.8.12",
    families,
    bootstrapSamples: [
      ["family-1", "family-2", "family-3", "family-4"],
      ["family-1", "family-1", "family-3", "family-4"],
      ["family-1", "family-2", "family-3", "family-3"],
    ],
  });

  assert.deepEqual(report.qpcfr.macroByDomain, {
    state: "measured",
    value: 0.5,
    strataMeasured: 2,
    strataTotal: 2,
  });
  assert.deepEqual(report.qpcfr.macroByOperation, {
    state: "measured",
    value: 0.5,
    strataMeasured: 2,
    strataTotal: 2,
  });
  assert.deepEqual(report.qpcfr.byOperation, [
    {
      key: "rank",
      state: "measured",
      numerator: 0,
      denominator: 2,
      value: 0,
    },
    {
      key: "summarize",
      state: "measured",
      numerator: 2,
      denominator: 2,
      value: 1,
    },
  ]);
  assert.deepEqual(report.bootstrap, {
    unit: "case_family",
    samples: 3,
    macroByDomain: { lower: 0.525, upper: 0.75 },
    macroByOperation: { lower: 0.5, upper: 0.5 },
  });
  assert.deepEqual(report.efficiency, {
    state: "measured",
    sampleCount: 4,
    wallTimeMs: { mean: 250, median: 250 },
    inputTokens: { mean: 25, median: 25 },
    outputTokens: { mean: 12.5, median: 12.5 },
  });
  assert.equal(report.familyStateCounts.unmeasured, 1);
  assert.equal("score" in report, false);
  assert.equal("weightedScore" in report, false);
});

test("an unmeasured denominator stays unmeasured instead of becoming zero", () => {
  const report = aggregateBenchmark({
    release: "2026.8.12",
    families: [
      {
        release: "2026.8.12",
        familyId: "family-only",
        domain: "workplace",
        operation: "prioritize",
        state: "unmeasured",
        qualified: null,
        conditionLabels: ["T0"],
        sensitiveContrast: null,
        invariantsPreserved: null,
        criticalFailure: null,
        trialStateCounts: { unmeasured: 1 },
        efficiency: [],
      },
    ],
    bootstrapSamples: [],
  });

  assert.deepEqual(report.qpcfr.byDomain, [
    {
      key: "workplace",
      state: "unmeasured",
      numerator: 0,
      denominator: 0,
      value: null,
    },
  ]);
  assert.equal(report.qpcfr.macroByDomain.state, "unmeasured");
  assert.equal(report.qpcfr.macroByDomain.value, null);
  assert.equal(report.efficiency.state, "unmeasured");
});

test("aggregation rejects duplicate family identities regardless of order", () => {
  const conflictingDuplicate: FamilyVerdict = {
    ...aggregateFamily,
    domain: "travel",
    qualified: false,
    sensitiveContrast: false,
  };

  for (const families of [
    [aggregateFamily, conflictingDuplicate],
    [conflictingDuplicate, aggregateFamily],
  ]) {
    assert.throws(
      () =>
        aggregateBenchmark({
          release: "2026.8.12",
          families,
          bootstrapSamples: [[aggregateFamily.familyId]],
        }),
      /familyId.*unique/i,
    );
  }
});

test("aggregation rejects empty bootstrap fixtures alone or mixed", () => {
  const fixtureSets: readonly (readonly (readonly string[])[])[] = [
    [[]],
    [[aggregateFamily.familyId], []],
  ];

  for (const bootstrapSamples of fixtureSets) {
    assert.throws(
      () =>
        aggregateBenchmark({
          release: "2026.8.12",
          families: [aggregateFamily],
          bootstrapSamples,
        }),
      /bootstrap fixture.*empty/i,
    );
  }
});

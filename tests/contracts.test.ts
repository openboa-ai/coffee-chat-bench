import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  caseSourceDigest,
  parseCaseBundle,
  parseDecisionManifest,
  parseJudgeVote,
} from "../src/contracts.ts";
import { stableDigest } from "../src/digest.ts";

const digestA = `sha256:${"a".repeat(64)}`;
const digestB = `sha256:${"b".repeat(64)}`;
const digestC = `sha256:${"c".repeat(64)}`;

const calendarContent =
  "A two-hour focus block ends thirty minutes before an optional meeting.";
const notesContent = "The summary must cite the supplied source material.";
const perspectiveAContent =
  "Protect uninterrupted work blocks and move optional meetings when deadlines are near.";
const perspectiveBContent =
  "Use optional meetings to align early when coordination risk is high.";
const irrelevantPerspectiveContent =
  "Prefer short written updates before recurring status meetings.";

const caseSemanticFields = {
  release: "2026.8.12",
  caseId: "case-alpha",
  familyId: "family-alpha",
  domain: "workplace",
  operation: "prioritize",
  difficulty: "standard",
  task: {
    instruction:
      "Choose one region for each decision using the evidence and any supplied perspective.",
    deliverable:
      "Write /app/output.json with the declared decision manifest and a concise evidence-grounded response.",
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
      prompt: "How should the focus block and optional meeting be handled?",
      regionOptions: [
        "neutral",
        "protect-focus",
        "defer-meeting",
        "attend-meeting",
        "move-focus",
      ],
      partition: "sensitive",
      acceptedRegions: {
        T0: ["neutral"],
        "T1-A": ["protect-focus", "defer-meeting"],
        "T1-B": ["attend-meeting", "move-focus"],
      },
      requiredEvidenceRefs: ["source-calendar"],
    },
    {
      decisionId: "decision-deadline",
      prompt: "How should the deadline be handled?",
      regionOptions: ["keep-deadline", "move-deadline-with-approval"],
      partition: "invariant",
      acceptedRegions: {
        T0: ["keep-deadline", "move-deadline-with-approval"],
        "T1-A": ["keep-deadline", "move-deadline-with-approval"],
        "T1-B": ["keep-deadline", "move-deadline-with-approval"],
      },
      requiredEvidenceRefs: ["source-notes"],
    },
  ],
  nonGoal: "Predict a real person's behavior.",
} as const;
const caseBundle = {
  ...caseSemanticFields,
  sourceDigest: stableDigest(caseSemanticFields),
} as const;

const manifest = {
  release: "2026.8.12",
  trialId: `trial-${"1".repeat(64)}`,
  caseId: "case-alpha",
  condition: "T1-A",
  artifactDigest: digestA,
  decisions: [
    {
      decisionId: "decision-focus",
      selectedRegion: "protect-focus",
      evidenceRefs: ["source-calendar"],
    },
    {
      decisionId: "decision-deadline",
      selectedRegion: "keep-deadline",
      evidenceRefs: ["source-notes"],
    },
  ],
} as const;

const judgeVote = {
  release: "2026.8.12",
  trialId: `trial-${"1".repeat(64)}`,
  judgeId: "judge-sol-1",
  requestedModelId: "gpt-fixture-sol",
  resolvedModelId: "gpt-fixture-sol-2026-08-12",
  promptDigest: digestB,
  responseDigest: digestC,
  state: "measured",
  dimensions: {
    taskAdequate: true,
    evidenceIntegrity: true,
    perspectiveAligned: true,
    invariantsPreserved: true,
    criticalFailure: false,
  },
  evidenceRefs: ["source-calendar", "source-notes"],
} as const;

test("public contract parsers accept complete literal artifacts", () => {
  assert.deepEqual(parseCaseBundle(caseBundle), caseBundle);
  assert.deepEqual(parseDecisionManifest(manifest), manifest);
  assert.deepEqual(parseJudgeVote(judgeVote), judgeVote);
});

test("case parsing rejects incomplete partitions and dangling evidence", () => {
  assert.throws(
    () =>
      parseCaseBundle({
        ...caseBundle,
        decisions: [caseBundle.decisions[0]],
      }),
    /sensitive and invariant/i,
  );

  assert.throws(
    () =>
      parseCaseBundle({
        ...caseBundle,
        decisions: [
          caseBundle.decisions[0],
          {
            ...caseBundle.decisions[1],
            requiredEvidenceRefs: ["source-missing"],
          },
        ],
      }),
    /evidence/i,
  );
});

test("case parsing rejects digest, pair-provenance, and accepted-region tampering", () => {
  assert.throws(
    () =>
      parseCaseBundle({
        ...caseBundle,
        evidence: [
          { ...caseBundle.evidence[0], digest: digestA },
          caseBundle.evidence[1],
        ],
      }),
    /digest.*content/i,
  );
  assert.throws(
    () =>
      parseCaseBundle({
        ...caseBundle,
        perspectives: {
          ...caseBundle.perspectives,
          B: { ...caseBundle.perspectives.B, pairId: "different-pair" },
        },
      }),
    /pair provenance/i,
  );
  assert.throws(
    () =>
      parseCaseBundle({
        ...caseBundle,
        decisions: [
          {
            ...caseBundle.decisions[0],
            acceptedRegions: {
              ...caseBundle.decisions[0].acceptedRegions,
              T0: ["undeclared"],
            },
          },
          caseBundle.decisions[1],
        ],
      }),
    /undeclared region/i,
  );
});

test("source digest deterministically covers public and hidden semantic fields", () => {
  assert.equal(caseSourceDigest(caseBundle), caseBundle.sourceDigest);
  const mutations = [
    { ...caseBundle, domain: "different-domain" },
    {
      ...caseBundle,
      task: { ...caseBundle.task, instruction: "Different instruction." },
    },
    {
      ...caseBundle,
      evidence: [
        {
          ...caseBundle.evidence[0],
          ref: "different-evidence-reference",
        },
        caseBundle.evidence[1],
      ],
    },
    {
      ...caseBundle,
      perspectives: {
        ...caseBundle.perspectives,
        A: { ...caseBundle.perspectives.A, id: "different-perspective" },
      },
    },
    {
      ...caseBundle,
      decisions: [
        {
          ...caseBundle.decisions[0],
          prompt: "Different decision prompt.",
        },
        caseBundle.decisions[1],
      ],
    },
    { ...caseBundle, nonGoal: "Different non-goal." },
  ] as const;
  for (const mutation of mutations) {
    assert.notEqual(caseSourceDigest(mutation), caseBundle.sourceDigest);
  }
});

test("manifest parsing enforces exact condition labels and unique decisions", () => {
  assert.throws(
    () => parseDecisionManifest({ ...manifest, condition: "CC" }),
    /condition/i,
  );
  assert.throws(
    () =>
      parseDecisionManifest({
        ...manifest,
        decisions: [manifest.decisions[0], manifest.decisions[0]],
      }),
    /unique/i,
  );
});

test("judge votes use explicit measured and unavailable branches", () => {
  const unavailable = {
    release: "2026.8.12",
    trialId: `trial-${"2".repeat(64)}`,
    judgeId: "judge-terra-1",
    requestedModelId: "gpt-fixture-terra",
    state: "judge_unavailable",
    reason: "fixture transport unavailable",
    evidenceRefs: [],
  } as const;

  assert.deepEqual(parseJudgeVote(unavailable), unavailable);
  assert.throws(
    () =>
      parseJudgeVote({
        ...unavailable,
        dimensions: judgeVote.dimensions,
      }),
    /judge_unavailable/i,
  );
});

test("public JSON schemas preserve exact labels, states, and separate metrics", async () => {
  const schemaNames = [
    "case",
    "decision-manifest",
    "judge-vote",
    "verdict",
    "report",
  ] as const;
  const schemas = Object.fromEntries(
    await Promise.all(
      schemaNames.map(async (name) => [
        name,
        JSON.parse(
          await readFile(
            new URL(`../schemas/${name}.schema.json`, import.meta.url),
            {
              encoding: "utf8",
            },
          ),
        ) as Record<string, unknown>,
      ]),
    ),
  ) as Record<(typeof schemaNames)[number], Record<string, unknown>>;

  for (const name of schemaNames) {
    assert.equal(
      schemas[name].$id,
      `https://openboa.ai/coffee-chat-bench/2026.8.12/schemas/${name}.schema.json`,
    );
    assert.equal(schemas[name].additionalProperties, false);
  }

  assert.deepEqual(
    (
      schemas["decision-manifest"].properties as Record<
        string,
        Record<string, unknown>
      >
    ).condition?.enum,
    ["T0", "T1-A", "T1-B"],
  );
  const resultState = (
    schemas.verdict.$defs as Record<string, Record<string, unknown> | undefined>
  ).resultState;
  assert.ok(resultState);
  assert.deepEqual(resultState.enum, [
    "measured",
    "candidate_invalid",
    "candidate_failure",
    "host_failure",
    "verifier_failure",
    "judge_disagreement",
    "judge_unavailable",
    "skipped",
    "unavailable",
    "unmeasured",
  ]);
  const reportProperties = schemas.report.properties as Record<string, unknown>;
  assert.deepEqual(Object.keys(reportProperties).sort(), [
    "bootstrap",
    "efficiency",
    "familyStateCounts",
    "qpcfr",
    "release",
    "trialStateCounts",
  ]);
  assert.equal("score" in reportProperties, false);
  assert.equal("weightedScore" in reportProperties, false);
});

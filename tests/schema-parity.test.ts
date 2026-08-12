import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchema, ValidateFunction } from "ajv";

import {
  parseCaseBundle,
  parseDecisionManifest,
  parseJudgeVote,
} from "../src/contracts.ts";
import {
  aggregateBenchmark,
  qualifyFamily,
  qualifyTrial,
} from "../src/metrics.ts";
import { stableDigest } from "../src/digest.ts";

const digest = `sha256:${"a".repeat(64)}` as const;

const evidenceContent = "The source requires a bounded, cited recommendation.";
const perspectiveAContent = "Prefer direct recommendations.";
const perspectiveBContent = "Prefer contextual recommendations.";
const irrelevantPerspectiveContent = "Prefer short weekly updates.";

const caseSemanticFields = {
  release: "2026.8.12",
  caseId: "case-schema",
  familyId: "family-schema",
  domain: "workplace",
  operation: "prioritize",
  difficulty: "standard",
  task: {
    instruction: "Choose one declared region for each decision.",
    deliverable: "Return the declared decision manifest.",
  },
  evidence: [
    {
      ref: "source-1",
      content: evidenceContent,
      digest: stableDigest(evidenceContent),
    },
  ],
  perspectives: {
    A: {
      id: "perspective-schema-a",
      pairId: "perspective-pair-schema",
      content: perspectiveAContent,
      digest: stableDigest(perspectiveAContent),
    },
    B: {
      id: "perspective-schema-b",
      pairId: "perspective-pair-schema",
      content: perspectiveBContent,
      digest: stableDigest(perspectiveBContent),
    },
    irrelevant: {
      id: "perspective-schema-irrelevant",
      pairId: "perspective-pair-irrelevant",
      content: irrelevantPerspectiveContent,
      digest: stableDigest(irrelevantPerspectiveContent),
    },
  },
  decisions: [
    {
      decisionId: "sensitive-1",
      prompt: "Which recommendation style should be used?",
      regionOptions: ["neutral", "region-a", "region-b"],
      partition: "sensitive",
      acceptedRegions: {
        T0: ["neutral"],
        "T1-A": ["region-a"],
        "T1-B": ["region-b"],
      },
      requiredEvidenceRefs: ["source-1"],
    },
    {
      decisionId: "invariant-1",
      prompt: "Should the recommendation preserve the evidence bound?",
      regionOptions: ["preserve", "unbounded"],
      partition: "invariant",
      acceptedRegions: {
        T0: ["preserve"],
        "T1-A": ["preserve"],
        "T1-B": ["preserve"],
      },
      requiredEvidenceRefs: ["source-1"],
    },
  ],
  nonGoal: "Infer a real person.",
} as const;
const caseArtifact = {
  ...caseSemanticFields,
  sourceDigest: stableDigest(caseSemanticFields),
} as const;

function manifestArtifact(condition: "T1-A" | "T1-B", trialDigit: string) {
  return {
    release: "2026.8.12",
    trialId: `trial-${trialDigit.repeat(64)}`,
    caseId: "case-schema",
    condition,
    artifactDigest: digest,
    decisions: [
      {
        decisionId: "sensitive-1",
        selectedRegion: condition === "T1-A" ? "region-a" : "region-b",
        evidenceRefs: ["source-1"],
      },
      {
        decisionId: "invariant-1",
        selectedRegion: "preserve",
        evidenceRefs: ["source-1"],
      },
    ],
  } as const;
}

const judgeVoteArtifact = {
  release: "2026.8.12",
  trialId: `trial-${"1".repeat(64)}`,
  judgeId: "judge-schema",
  requestedModelId: "model-requested",
  resolvedModelId: "model-resolved",
  promptDigest: digest,
  responseDigest: digest,
  state: "measured",
  dimensions: {
    taskAdequate: true,
    evidenceIntegrity: true,
    perspectiveAligned: true,
    invariantsPreserved: true,
    criticalFailure: false,
  },
  evidenceRefs: ["source-1"],
} as const;

const schemaNames = [
  "case",
  "decision-manifest",
  "judge-vote",
  "verdict",
  "report",
] as const;

function loadSchema(name: (typeof schemaNames)[number]): AnySchema {
  return JSON.parse(
    readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), {
      encoding: "utf8",
    }),
  ) as AnySchema;
}

function compileSchemas(): Record<
  (typeof schemaNames)[number],
  ValidateFunction
> {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
    strictRequired: false,
  });
  return Object.fromEntries(
    schemaNames.map((name) => [name, ajv.compile(loadSchema(name))]),
  ) as Record<(typeof schemaNames)[number], ValidateFunction>;
}

function measuredTrial(condition: "T1-A" | "T1-B", trialDigit: string) {
  const parsedCase = parseCaseBundle(caseArtifact);
  const manifest = parseDecisionManifest(
    manifestArtifact(condition, trialDigit),
  );
  return qualifyTrial({
    state: "measured",
    trialId: manifest.trialId,
    condition,
    caseBundle: parsedCase,
    manifest,
    assessment: {
      dimensions: judgeVoteArtifact.dimensions,
      evidenceRefs: ["source-1"],
    },
    efficiency: { wallTimeMs: 10, inputTokens: 2, outputTokens: 1 },
  });
}

test("Draft 2020-12 schemas validate representative runtime artifacts", () => {
  const validate = compileSchemas();
  const parsedCase = parseCaseBundle(caseArtifact);
  const manifestA = parseDecisionManifest(manifestArtifact("T1-A", "1"));
  const vote = parseJudgeVote(judgeVoteArtifact);
  const trialA = measuredTrial("T1-A", "1");
  const trialB = measuredTrial("T1-B", "2");
  const family = qualifyFamily({
    caseBundle: parsedCase,
    trials: [trialA, trialB],
  });
  const report = aggregateBenchmark({
    release: "2026.8.12",
    families: [family],
    bootstrapSamples: [[family.familyId]],
  });
  const artifacts = {
    case: parsedCase,
    "decision-manifest": manifestA,
    "judge-vote": vote,
    verdict: trialA,
    report,
  } as const;
  for (const name of schemaNames) {
    assert.equal(
      validate[name](artifacts[name]),
      true,
      `${name}: ${JSON.stringify(validate[name].errors)}`,
    );
  }
});

test("verdict schema rejects measured and non-measured state incoherence", () => {
  const validate = compileSchemas().verdict;
  const measured = measuredTrial("T1-A", "1");
  const nonMeasured = qualifyTrial({
    state: "unmeasured",
    trialId: `trial-${"3".repeat(64)}`,
    condition: "T0",
    caseBundle: parseCaseBundle(caseArtifact),
  });

  assert.equal(validate({ ...measured, qualified: null }), false);
  assert.equal(
    validate({ ...measured, qualified: false, criticalFailure: true }),
    false,
  );
  assert.equal(
    validate({
      ...measured,
      qualified: false,
      dimensions: { ...measured.dimensions, criticalFailure: true },
    }),
    false,
  );
  assert.equal(
    validate({
      ...nonMeasured,
      qualified: true,
      dimensions: judgeVoteArtifact.dimensions,
      criticalFailure: false,
      decisions: measured.decisions,
    }),
    false,
  );
});

test("schemas reject representative malformed wire structures", () => {
  const validate = compileSchemas();
  const { nonGoal: _nonGoal, ...caseWithoutNonGoal } = caseArtifact;
  const { promptDigest: _promptDigest, ...voteWithoutPromptDigest } =
    judgeVoteArtifact;
  const trialA = measuredTrial("T1-A", "1");
  const trialB = measuredTrial("T1-B", "2");
  const family = qualifyFamily({
    caseBundle: parseCaseBundle(caseArtifact),
    trials: [trialA, trialB],
  });
  const report = aggregateBenchmark({
    release: "2026.8.12",
    families: [family],
    bootstrapSamples: [[family.familyId]],
  });
  const domainRate = report.qpcfr.byDomain[0];
  assert.ok(domainRate);

  assert.equal(validate.case(caseWithoutNonGoal), false);
  assert.equal(
    validate["decision-manifest"]({
      ...manifestArtifact("T1-A", "1"),
      condition: "CC",
    }),
    false,
  );
  assert.equal(validate["judge-vote"](voteWithoutPromptDigest), false);
  assert.equal(validate.report({ ...report, weightedScore: 1 }), false);
  assert.equal(
    validate.report({
      ...report,
      qpcfr: {
        ...report.qpcfr,
        byDomain: [{ ...domainRate, state: "unmeasured" }],
      },
    }),
    false,
  );
});

test("schemas stay structural while runtime parsers own semantic integrity", () => {
  const validate = compileSchemas();
  const duplicateDecisionIds = {
    ...caseArtifact,
    decisions: [
      caseArtifact.decisions[0],
      { ...caseArtifact.decisions[1], decisionId: "sensitive-1" },
    ],
  };
  const danglingEvidence = {
    ...caseArtifact,
    decisions: [
      caseArtifact.decisions[0],
      {
        ...caseArtifact.decisions[1],
        requiredEvidenceRefs: ["source-missing"],
      },
    ],
  };

  assert.equal(validate.case(duplicateDecisionIds), true);
  assert.throws(() => parseCaseBundle(duplicateDecisionIds), /unique/i);
  assert.equal(validate.case(danglingEvidence), true);
  assert.throws(() => parseCaseBundle(danglingEvidence), /evidence/i);

  for (const name of ["case", "decision-manifest", "judge-vote"] as const) {
    const schema = loadSchema(name) as Record<string, unknown>;
    assert.match(String(schema.$comment), /structural wire validation/i);
    assert.match(String(schema.$comment), /runtime parser/i);
  }
});

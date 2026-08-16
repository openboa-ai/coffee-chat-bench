import {
  APPROVED_JUDGE_MODELS,
  CROSS_VALIDATION_JUDGE_MODELS,
  PRIMARY_JUDGE_MODELS,
  RELEASE_ID,
  stableDigest,
  type CaseManifestSemantic,
} from "../src/contracts.ts";
import {
  JUDGE_PROTOCOL,
  bindQualifiedJudgeConfiguration,
} from "../src/judge.ts";

export function judgeConfigurationFixture(label: string) {
  const studyDigest = stableDigest({ study: label });
  const qualifications = Object.fromEntries(
    APPROVED_JUDGE_MODELS.map((model) => {
      const semantic = {
        release: RELEASE_ID,
        protocol: JUDGE_PROTOCOL,
        studyDigest,
        model,
        state: "qualified" as const,
        qualificationEvidenceDigest: stableDigest({ model, study: label }),
      };
      return [model, { ...semantic, evidenceDigest: stableDigest(semantic) }];
    }),
  );
  return bindQualifiedJudgeConfiguration({
    protocol: JUDGE_PROTOCOL,
    studyDigest,
    primaryJudges: PRIMARY_JUDGE_MODELS,
    crossValidationJudges: CROSS_VALIDATION_JUDGE_MODELS,
    qualifications,
  });
}

export function caseSemantic(): CaseManifestSemantic {
  return {
    release: RELEASE_ID,
    caseId: "case-talk-001",
    familyId: "family-judgment-001",
    targetPairBlockId: "target-block-001",
    form: "dialogue",
    split: "judge_qualification",
    task: {
      instruction:
        "Explain the central trade-off and recommend the next move with citations.",
      environment: { kind: "conversation" },
      output: {
        mediaType: "text/plain",
        maxBytes: 4_096,
        requiredReferenceIds: ["source-001"],
      },
    },
    evidence: [
      {
        id: "source-001",
        content:
          "The proposal increases speed but makes reversals more expensive.",
        source: "openboa synthetic benchmark",
        license: "MIT",
      },
    ],
    contexts: {
      task_only: [],
      nondiagnostic_target_a: [
        {
          id: "context-neutral-a-001",
          content:
            "The reviewer read the source and summarized its sections for target A.",
        },
      ],
      nondiagnostic_target_b: [
        {
          id: "context-neutral-b-001",
          content:
            "The reviewer read the source and summarized its sections for target B.",
        },
      ],
      diagnostic_target_a: [
        {
          id: "context-a-001",
          content:
            "The reviewer prioritizes reversible experiments before scaling.",
        },
      ],
      diagnostic_target_b: [
        {
          id: "context-b-001",
          content:
            "The reviewer prioritizes operational consistency before experimentation.",
        },
      ],
    },
    lineage: {
      sourceIds: ["synthetic-source-001"],
      templateId: "dialogue-tradeoff-template-001",
      rubricTemplateId: "dialogue-rubric-template-001",
    },
    sealed: {
      rubricDigest: stableDigest({ rubric: "case-talk-001" }),
      judgmentPlanDigest: stableDigest({ plan: "case-talk-001" }),
    },
  };
}

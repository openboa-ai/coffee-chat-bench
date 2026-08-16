import { stableDigest, type Digest } from "./digest.ts";

export { canonicalJson, stableDigest, type Digest } from "./digest.ts";

export const RELEASE_ID = "2026.8.12" as const;
export const BENCHMARK_FORMS = ["dialogue", "professional_artifact"] as const;
export const BANK_SPLITS = [
  "judge_qualification",
  "release_a",
  "release_b",
] as const;
export const BENCHMARK_CONDITIONS = [
  "task_only",
  "nondiagnostic_target_a",
  "nondiagnostic_target_b",
  "diagnostic_target_a",
  "diagnostic_target_b",
] as const;
export const JUDGE_DIMENSIONS = [
  "target_alignment",
  "task_utility",
  "evidence_integrity",
  "target_specificity",
  "critical_failure",
] as const;
export const PRIMARY_JUDGE_MODELS = ["gpt-5.6-terra", "gpt-5.6-luna"] as const;
export const CROSS_VALIDATION_JUDGE_MODELS = ["gpt-5.6-sol"] as const;
export const APPROVED_JUDGE_MODELS = [
  ...PRIMARY_JUDGE_MODELS,
  ...CROSS_VALIDATION_JUDGE_MODELS,
] as const;

export type BenchmarkForm = (typeof BENCHMARK_FORMS)[number];
export type BankSplit = (typeof BANK_SPLITS)[number];
export type BenchmarkCondition = (typeof BENCHMARK_CONDITIONS)[number];
export type JudgeDimension = (typeof JUDGE_DIMENSIONS)[number];
export type ApprovedJudgeModel = (typeof APPROVED_JUDGE_MODELS)[number];
export type PrimaryJudgeModel = (typeof PRIMARY_JUDGE_MODELS)[number];
export type CrossValidationJudgeModel =
  (typeof CROSS_VALIDATION_JUDGE_MODELS)[number];

const CASE_SEMANTIC_KEYS = [
  "release",
  "caseId",
  "familyId",
  "targetPairBlockId",
  "form",
  "split",
  "task",
  "evidence",
  "contexts",
  "lineage",
  "sealed",
] as const;

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  return value as JsonRecord;
}

function exact(
  value: JsonRecord,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new TypeError(`${label} must contain exactly ${expected.join(", ")}`);
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  return value === null ? null : string(value, label);
}

function literal<const T extends readonly string[]>(
  value: unknown,
  values: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !values.includes(value))
    throw new TypeError(`${label} must be one of ${values.join(", ")}`);
  return value as T[number];
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new TypeError(`${label} must be an integer >= ${minimum}`);
  return value as number;
}

function finite(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum)
    throw new TypeError(`${label} must be finite and >= ${minimum}`);
  return value;
}

function digest(value: unknown, label: string): Digest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} must be a sha256 digest`);
  return value as Digest;
}

function commit(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/u.test(value))
    throw new TypeError(`${label} must be a full Git commit SHA`);
  return value;
}

function items(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function strings(
  value: unknown,
  label: string,
  { nonempty = false }: { readonly nonempty?: boolean } = {},
): string[] {
  const parsed = items(value, label).map((entry, index) =>
    string(entry, `${label}[${index}]`),
  );
  if (nonempty && parsed.length === 0)
    throw new TypeError(`${label} must not be empty`);
  if (new Set(parsed).size !== parsed.length)
    throw new TypeError(`${label} must not contain duplicates`);
  return parsed;
}

function verifyDigest(
  value: JsonRecord,
  identityField: string,
  semantic: unknown,
  label: string,
): Digest {
  const actual = digest(value[identityField], `${label}.${identityField}`);
  if (actual !== stableDigest(semantic))
    throw new TypeError(`${label}.${identityField} does not match its content`);
  return actual;
}

export interface CaseManifestSemantic {
  readonly release: typeof RELEASE_ID;
  readonly caseId: string;
  readonly familyId: string;
  readonly targetPairBlockId: string;
  readonly form: BenchmarkForm;
  readonly split: BankSplit;
  readonly task: {
    readonly instruction: string;
    readonly environment:
      | { readonly kind: "conversation" }
      | {
          readonly kind: "workspace";
          readonly fixtureDigest: Digest;
          readonly verifierDigest: Digest;
        };
    readonly output: {
      readonly mediaType: "text/plain";
      readonly maxBytes: number;
      readonly requiredReferenceIds: readonly string[];
    };
  };
  readonly evidence: readonly {
    readonly id: string;
    readonly content: string;
    readonly source: string;
    readonly license: "MIT";
  }[];
  readonly contexts: Readonly<
    Record<
      BenchmarkCondition,
      readonly { readonly id: string; readonly content: string }[]
    >
  >;
  readonly lineage: {
    readonly sourceIds: readonly string[];
    readonly templateId: string;
    readonly rubricTemplateId: string;
  };
  readonly sealed: {
    readonly rubricDigest: Digest;
    readonly judgmentPlanDigest: Digest;
  };
}

export type CaseManifest = CaseManifestSemantic & {
  readonly manifestDigest: Digest;
};

function parseContext(value: unknown, label: string) {
  return items(value, label).map((entry, index) => {
    const parsed = record(entry, `${label}[${index}]`);
    exact(parsed, ["id", "content"], `${label}[${index}]`);
    return {
      id: string(parsed.id, `${label}[${index}].id`),
      content: string(parsed.content, `${label}[${index}].content`),
    };
  });
}

function parseCaseSemantic(value: unknown): CaseManifestSemantic {
  const parsed = record(value, "case manifest semantic");
  exact(parsed, CASE_SEMANTIC_KEYS, "case manifest semantic");
  const task = record(parsed.task, "case manifest.task");
  exact(task, ["instruction", "environment", "output"], "case manifest.task");
  const environment = record(
    task.environment,
    "case manifest.task.environment",
  );
  const environmentKind = literal(
    environment.kind,
    ["conversation", "workspace"] as const,
    "case manifest.task.environment.kind",
  );
  exact(
    environment,
    environmentKind === "conversation"
      ? ["kind"]
      : ["kind", "fixtureDigest", "verifierDigest"],
    "case manifest.task.environment",
  );
  const output = record(task.output, "case manifest.task.output");
  exact(
    output,
    ["mediaType", "maxBytes", "requiredReferenceIds"],
    "case manifest.task.output",
  );
  const evidence = items(parsed.evidence, "case manifest.evidence").map(
    (entry, index) => {
      const item = record(entry, `case manifest.evidence[${index}]`);
      exact(
        item,
        ["id", "content", "source", "license"],
        `case manifest.evidence[${index}]`,
      );
      return {
        id: string(item.id, `case manifest.evidence[${index}].id`),
        content: string(
          item.content,
          `case manifest.evidence[${index}].content`,
        ),
        source: string(item.source, `case manifest.evidence[${index}].source`),
        license: literal(
          item.license,
          ["MIT"] as const,
          `case manifest.evidence[${index}].license`,
        ),
      };
    },
  );
  if (evidence.length === 0)
    throw new TypeError("case manifest.evidence must not be empty");
  const evidenceIds = evidence.map(({ id }) => id);
  if (new Set(evidenceIds).size !== evidenceIds.length)
    throw new TypeError("case manifest evidence IDs must be unique");
  const requiredReferenceIds = strings(
    output.requiredReferenceIds,
    "case manifest.task.output.requiredReferenceIds",
  );
  if (requiredReferenceIds.some((id) => !evidenceIds.includes(id)))
    throw new TypeError("required references must resolve to case evidence");
  const contexts = record(parsed.contexts, "case manifest.contexts");
  exact(contexts, BENCHMARK_CONDITIONS, "case manifest.contexts");
  const contextProjection = Object.fromEntries(
    BENCHMARK_CONDITIONS.map((condition) => [
      condition,
      parseContext(contexts[condition], `case manifest.contexts.${condition}`),
    ]),
  ) as unknown as CaseManifestSemantic["contexts"];
  if (contextProjection.task_only.length !== 0)
    throw new TypeError("task_only context must be empty");
  for (const condition of BENCHMARK_CONDITIONS.slice(1))
    if (contextProjection[condition].length === 0)
      throw new TypeError(`${condition} context must not be empty`);
  const lineage = record(parsed.lineage, "case manifest.lineage");
  exact(
    lineage,
    ["sourceIds", "templateId", "rubricTemplateId"],
    "case manifest.lineage",
  );
  const sealed = record(parsed.sealed, "case manifest.sealed");
  exact(sealed, ["rubricDigest", "judgmentPlanDigest"], "case manifest.sealed");
  return {
    release: literal(parsed.release, [RELEASE_ID], "case manifest.release"),
    caseId: string(parsed.caseId, "case manifest.caseId"),
    familyId: string(parsed.familyId, "case manifest.familyId"),
    targetPairBlockId: string(
      parsed.targetPairBlockId,
      "case manifest.targetPairBlockId",
    ),
    form: literal(parsed.form, BENCHMARK_FORMS, "case manifest.form"),
    split: literal(parsed.split, BANK_SPLITS, "case manifest.split"),
    task: {
      instruction: string(task.instruction, "case manifest.task.instruction"),
      environment:
        environmentKind === "conversation"
          ? { kind: environmentKind }
          : {
              kind: environmentKind,
              fixtureDigest: digest(
                environment.fixtureDigest,
                "case manifest.task.environment.fixtureDigest",
              ),
              verifierDigest: digest(
                environment.verifierDigest,
                "case manifest.task.environment.verifierDigest",
              ),
            },
      output: {
        mediaType: literal(
          output.mediaType,
          ["text/plain"] as const,
          "case manifest.task.output.mediaType",
        ),
        maxBytes: integer(
          output.maxBytes,
          "case manifest.task.output.maxBytes",
          1,
        ),
        requiredReferenceIds,
      },
    },
    evidence,
    contexts: contextProjection,
    lineage: {
      sourceIds: strings(lineage.sourceIds, "case manifest.lineage.sourceIds", {
        nonempty: true,
      }),
      templateId: string(
        lineage.templateId,
        "case manifest.lineage.templateId",
      ),
      rubricTemplateId: string(
        lineage.rubricTemplateId,
        "case manifest.lineage.rubricTemplateId",
      ),
    },
    sealed: {
      rubricDigest: digest(
        sealed.rubricDigest,
        "case manifest.sealed.rubricDigest",
      ),
      judgmentPlanDigest: digest(
        sealed.judgmentPlanDigest,
        "case manifest.sealed.judgmentPlanDigest",
      ),
    },
  };
}

export function createCaseManifest(
  semanticValue: CaseManifestSemantic,
): CaseManifest {
  const semantic = parseCaseSemantic(semanticValue);
  return { ...semantic, manifestDigest: stableDigest(semantic) };
}

export function parseCaseManifest(value: unknown): CaseManifest {
  const parsed = record(value, "case manifest");
  exact(parsed, [...CASE_SEMANTIC_KEYS, "manifestDigest"], "case manifest");
  const { manifestDigest: _identity, ...semanticValue } = parsed;
  const semantic = parseCaseSemantic(semanticValue);
  return {
    ...semantic,
    manifestDigest: verifyDigest(
      parsed,
      "manifestDigest",
      semantic,
      "case manifest",
    ),
  };
}

export interface CandidateSemantic {
  readonly candidateId: string;
  readonly harness: string;
  readonly model: string;
  readonly host: string;
  readonly adaptation: string;
  readonly configurationDigest: Digest;
  readonly toolPolicyDigest: Digest;
}

export type CandidateIdentity = CandidateSemantic & {
  readonly candidateDigest: Digest;
};

export type ExecutionEvidence =
  | {
      readonly kind: "conversation";
      readonly hostReceiptDigest: Digest;
      readonly transcriptDigest: Digest;
      readonly turnCount: number;
      readonly termination: "completed" | "max_turns";
      readonly cleanup: "succeeded" | "failed" | "unavailable";
    }
  | {
      readonly kind: "workspace";
      readonly hostReceiptDigest: Digest;
      readonly inputTreeDigest: Digest;
      readonly outputTreeDigest: Digest;
      readonly verifierReceiptDigest: Digest;
      readonly network: "disabled" | "restricted" | "unverified";
      readonly cleanup: "succeeded" | "failed" | "unavailable";
    };

export interface SessionEvidence {
  readonly sessionDigest: Digest;
  readonly order: number;
  readonly leakage: "passed" | "failed" | "unavailable";
  readonly leakageCheckDigest: Digest;
}

interface RunReceiptBase {
  readonly release: typeof RELEASE_ID;
  readonly benchCommit: string;
  readonly bankDigest: Digest;
  readonly trialId: string;
  readonly caseId: string;
  readonly manifestDigest: Digest;
  readonly taskDigest: Digest;
  readonly condition: BenchmarkCondition;
  readonly candidate: CandidateIdentity;
  readonly session: SessionEvidence;
  readonly execution: ExecutionEvidence | null;
}

export type RunReceiptSemantic = RunReceiptBase &
  (
    | {
        readonly state: "succeeded";
        readonly artifact: {
          readonly digest: Digest;
          readonly bytes: number;
          readonly mediaType: "text/plain";
          readonly validationDigest: Digest;
        };
        readonly durationMs: number;
        readonly usage: null | {
          readonly inputTokens: number;
          readonly outputTokens: number;
          readonly costNanoUsd: number;
        };
      }
    | {
        readonly state:
          | "candidate_failed"
          | "host_failed"
          | "invalid_artifact"
          | "verifier_failed"
          | "skipped"
          | "unavailable";
        readonly cause: string;
      }
  );

export type RunReceipt = RunReceiptSemantic & {
  readonly receiptDigest: Digest;
};

function parseCandidateSemantic(value: unknown): CandidateSemantic {
  const parsed = record(value, "candidate");
  exact(
    parsed,
    [
      "candidateId",
      "harness",
      "model",
      "host",
      "adaptation",
      "configurationDigest",
      "toolPolicyDigest",
    ],
    "candidate",
  );
  return {
    candidateId: string(parsed.candidateId, "candidate.candidateId"),
    harness: string(parsed.harness, "candidate.harness"),
    model: string(parsed.model, "candidate.model"),
    host: string(parsed.host, "candidate.host"),
    adaptation: string(parsed.adaptation, "candidate.adaptation"),
    configurationDigest: digest(
      parsed.configurationDigest,
      "candidate.configurationDigest",
    ),
    toolPolicyDigest: digest(
      parsed.toolPolicyDigest,
      "candidate.toolPolicyDigest",
    ),
  };
}

export function createCandidateIdentity(
  value: CandidateSemantic,
): CandidateIdentity {
  const semantic = parseCandidateSemantic(value);
  return { ...semantic, candidateDigest: stableDigest(semantic) };
}

export function parseCandidateIdentity(value: unknown): CandidateIdentity {
  const parsed = record(value, "candidate identity");
  if (!("candidateDigest" in parsed)) {
    throw new TypeError("candidate identity.candidateDigest is required");
  }
  const { candidateDigest: _identity, ...semanticValue } = parsed;
  const semantic = parseCandidateSemantic(semanticValue);
  return {
    ...semantic,
    candidateDigest: verifyDigest(
      parsed,
      "candidateDigest",
      semantic,
      "candidate identity",
    ),
  };
}

function parseExecution(value: unknown): ExecutionEvidence | null {
  if (value === null) return null;
  const parsed = record(value, "run receipt.execution");
  const kind = literal(
    parsed.kind,
    ["conversation", "workspace"] as const,
    "run receipt.execution.kind",
  );
  const cleanup = literal(
    parsed.cleanup,
    ["succeeded", "failed", "unavailable"] as const,
    "run receipt.execution.cleanup",
  );
  if (kind === "conversation") {
    exact(
      parsed,
      [
        "kind",
        "hostReceiptDigest",
        "transcriptDigest",
        "turnCount",
        "termination",
        "cleanup",
      ],
      "run receipt.execution",
    );
    return {
      kind,
      hostReceiptDigest: digest(
        parsed.hostReceiptDigest,
        "run receipt.execution.hostReceiptDigest",
      ),
      transcriptDigest: digest(
        parsed.transcriptDigest,
        "run receipt.execution.transcriptDigest",
      ),
      turnCount: integer(
        parsed.turnCount,
        "run receipt.execution.turnCount",
        1,
      ),
      termination: literal(
        parsed.termination,
        ["completed", "max_turns"] as const,
        "run receipt.execution.termination",
      ),
      cleanup,
    };
  }
  exact(
    parsed,
    [
      "kind",
      "hostReceiptDigest",
      "inputTreeDigest",
      "outputTreeDigest",
      "verifierReceiptDigest",
      "network",
      "cleanup",
    ],
    "run receipt.execution",
  );
  return {
    kind,
    hostReceiptDigest: digest(
      parsed.hostReceiptDigest,
      "run receipt.execution.hostReceiptDigest",
    ),
    inputTreeDigest: digest(
      parsed.inputTreeDigest,
      "run receipt.execution.inputTreeDigest",
    ),
    outputTreeDigest: digest(
      parsed.outputTreeDigest,
      "run receipt.execution.outputTreeDigest",
    ),
    verifierReceiptDigest: digest(
      parsed.verifierReceiptDigest,
      "run receipt.execution.verifierReceiptDigest",
    ),
    network: literal(
      parsed.network,
      ["disabled", "restricted", "unverified"] as const,
      "run receipt.execution.network",
    ),
    cleanup,
  };
}

function parseRunSemantic(value: unknown): RunReceiptSemantic {
  const parsed = record(value, "run receipt semantic");
  const state = literal(
    parsed.state,
    [
      "succeeded",
      "candidate_failed",
      "host_failed",
      "invalid_artifact",
      "verifier_failed",
      "skipped",
      "unavailable",
    ] as const,
    "run receipt.state",
  );
  const baseKeys = [
    "release",
    "benchCommit",
    "bankDigest",
    "trialId",
    "caseId",
    "manifestDigest",
    "taskDigest",
    "condition",
    "candidate",
    "session",
    "execution",
    "state",
  ];
  exact(
    parsed,
    state === "succeeded"
      ? [...baseKeys, "artifact", "durationMs", "usage"]
      : [...baseKeys, "cause"],
    "run receipt semantic",
  );
  const base: RunReceiptBase = {
    release: literal(parsed.release, [RELEASE_ID], "run receipt.release"),
    benchCommit: commit(parsed.benchCommit, "run receipt.benchCommit"),
    bankDigest: digest(parsed.bankDigest, "run receipt.bankDigest"),
    trialId: string(parsed.trialId, "run receipt.trialId"),
    caseId: string(parsed.caseId, "run receipt.caseId"),
    manifestDigest: digest(parsed.manifestDigest, "run receipt.manifestDigest"),
    taskDigest: digest(parsed.taskDigest, "run receipt.taskDigest"),
    condition: literal(
      parsed.condition,
      BENCHMARK_CONDITIONS,
      "run receipt.condition",
    ),
    candidate: parseCandidateIdentity(parsed.candidate),
    session: (() => {
      const session = record(parsed.session, "run receipt.session");
      exact(
        session,
        ["sessionDigest", "order", "leakage", "leakageCheckDigest"],
        "run receipt.session",
      );
      return {
        sessionDigest: digest(
          session.sessionDigest,
          "run receipt.session.sessionDigest",
        ),
        order: integer(session.order, "run receipt.session.order", 0),
        leakage: literal(
          session.leakage,
          ["passed", "failed", "unavailable"] as const,
          "run receipt.session.leakage",
        ),
        leakageCheckDigest: digest(
          session.leakageCheckDigest,
          "run receipt.session.leakageCheckDigest",
        ),
      };
    })(),
    execution: parseExecution(parsed.execution),
  };
  if (state !== "succeeded")
    return {
      ...base,
      state,
      cause: string(parsed.cause, "run receipt.cause"),
    };
  if (base.execution === null) {
    throw new TypeError("successful run receipt requires execution evidence");
  }
  const artifact = record(parsed.artifact, "run receipt.artifact");
  exact(
    artifact,
    ["digest", "bytes", "mediaType", "validationDigest"],
    "run receipt.artifact",
  );
  const usage =
    parsed.usage === null
      ? null
      : (() => {
          const entry = record(parsed.usage, "run receipt.usage");
          exact(
            entry,
            ["inputTokens", "outputTokens", "costNanoUsd"],
            "run receipt.usage",
          );
          return {
            inputTokens: integer(
              entry.inputTokens,
              "run receipt.usage.inputTokens",
            ),
            outputTokens: integer(
              entry.outputTokens,
              "run receipt.usage.outputTokens",
            ),
            costNanoUsd: integer(
              entry.costNanoUsd,
              "run receipt.usage.costNanoUsd",
            ),
          };
        })();
  return {
    ...base,
    state: "succeeded",
    artifact: {
      digest: digest(artifact.digest, "run receipt.artifact.digest"),
      bytes: integer(artifact.bytes, "run receipt.artifact.bytes"),
      mediaType: literal(
        artifact.mediaType,
        ["text/plain"] as const,
        "run receipt.artifact.mediaType",
      ),
      validationDigest: digest(
        artifact.validationDigest,
        "run receipt.artifact.validationDigest",
      ),
    },
    durationMs: finite(parsed.durationMs, "run receipt.durationMs"),
    usage,
  };
}

export function createRunReceipt(
  semanticValue: RunReceiptSemantic,
): RunReceipt {
  const semantic = parseRunSemantic(semanticValue);
  return { ...semantic, receiptDigest: stableDigest(semantic) };
}

export function parseRunReceipt(value: unknown): RunReceipt {
  const parsed = record(value, "run receipt");
  if (!("receiptDigest" in parsed))
    throw new TypeError("run receipt.receiptDigest is required");
  const { receiptDigest: _identity, ...semanticValue } = parsed;
  const semantic = parseRunSemantic(semanticValue);
  return {
    ...semantic,
    receiptDigest: verifyDigest(
      parsed,
      "receiptDigest",
      semantic,
      "run receipt",
    ),
  };
}

export type JudgeVerdict = "pass" | "fail" | "left" | "right" | "tie";

export type JudgeVote = {
  readonly model: ApprovedJudgeModel;
  readonly promptDigest: Digest;
  readonly usage: null | {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly costNanoUsd: number;
  };
} & (
  | {
      readonly state: "measured";
      readonly resolvedModel: string;
      readonly responseDigest: Digest;
      readonly verdict: JudgeVerdict;
    }
  | {
      readonly state: "abstained" | "invalid" | "unavailable" | "failed";
      readonly resolvedModel: string | null;
      readonly responseDigest: Digest | null;
      readonly cause: string;
    }
);

export type JudgmentOutcome =
  | { readonly state: "measured"; readonly verdict: JudgeVerdict }
  | {
      readonly state:
        "disagreement" | "abstained" | "invalid" | "unavailable" | "failed";
    };

export interface JudgmentSemanticInput {
  readonly release: typeof RELEASE_ID;
  readonly judgmentId: string;
  readonly trialIds: readonly string[];
  readonly caseId: string;
  readonly runReceiptDigests: readonly Digest[];
  readonly mode: "pointwise" | "pairwise";
  readonly dimension: JudgeDimension;
  readonly orientation: "canonical" | "mirrored" | null;
  readonly artifactDigests: readonly Digest[];
  readonly artifactValidationDigests: readonly Digest[];
  readonly rubricDigest: Digest;
  readonly rubricProjectionId: string;
  readonly rubricProjectionDigest: Digest;
  readonly judgeConfigurationDigest: Digest;
  readonly primaryJudges: readonly [PrimaryJudgeModel, PrimaryJudgeModel];
  readonly crossValidationJudges: readonly [CrossValidationJudgeModel];
  readonly votes: readonly JudgeVote[];
}

export type JudgmentRecord = JudgmentSemanticInput & {
  readonly outcome: JudgmentOutcome;
  readonly recordDigest: Digest;
};

function parseUsage(value: unknown, label: string): JudgeVote["usage"] {
  if (value === null) return null;
  const parsed = record(value, label);
  exact(parsed, ["inputTokens", "outputTokens", "costNanoUsd"], label);
  return {
    inputTokens: integer(parsed.inputTokens, `${label}.inputTokens`),
    outputTokens: integer(parsed.outputTokens, `${label}.outputTokens`),
    costNanoUsd: integer(parsed.costNanoUsd, `${label}.costNanoUsd`),
  };
}

function parseVote(
  value: unknown,
  mode: JudgmentSemanticInput["mode"],
  index: number,
): JudgeVote {
  const label = `judgment.votes[${index}]`;
  const parsed = record(value, label);
  const state = literal(
    parsed.state,
    ["measured", "abstained", "invalid", "unavailable", "failed"] as const,
    `${label}.state`,
  );
  const baseKeys = [
    "model",
    "resolvedModel",
    "promptDigest",
    "responseDigest",
    "state",
    "usage",
  ];
  exact(
    parsed,
    state === "measured" ? [...baseKeys, "verdict"] : [...baseKeys, "cause"],
    label,
  );
  const base = {
    model: literal(parsed.model, APPROVED_JUDGE_MODELS, `${label}.model`),
    promptDigest: digest(parsed.promptDigest, `${label}.promptDigest`),
    usage: parseUsage(parsed.usage, `${label}.usage`),
  };
  if (state !== "measured")
    return {
      ...base,
      state,
      resolvedModel: nullableString(
        parsed.resolvedModel,
        `${label}.resolvedModel`,
      ),
      responseDigest:
        parsed.responseDigest === null
          ? null
          : digest(parsed.responseDigest, `${label}.responseDigest`),
      cause: string(parsed.cause, `${label}.cause`),
    };
  const allowed =
    mode === "pointwise"
      ? (["pass", "fail"] as const)
      : (["left", "right", "tie"] as const);
  return {
    ...base,
    state: "measured",
    resolvedModel: string(parsed.resolvedModel, `${label}.resolvedModel`),
    responseDigest: digest(parsed.responseDigest, `${label}.responseDigest`),
    verdict: literal(parsed.verdict, allowed, `${label}.verdict`),
  };
}

function resolveOutcome(
  votes: readonly JudgeVote[],
  primaryJudges: JudgmentSemanticInput["primaryJudges"],
  crossValidationJudges: JudgmentSemanticInput["crossValidationJudges"],
): JudgmentOutcome {
  const primary = primaryJudges.map((model) =>
    votes.find((vote) => vote.model === model),
  );
  if (primary.some((vote) => vote === undefined))
    throw new TypeError("judgment primary judges must have votes");
  const [left, right] = primary as [JudgeVote, JudgeVote];
  if (left.state === "measured" && right.state === "measured") {
    if (left.verdict !== right.verdict) return { state: "disagreement" };
    const cross = crossValidationJudges.map((model) =>
      votes.find((vote) => vote.model === model),
    );
    if (cross.some((vote) => vote === undefined))
      throw new TypeError("judgment cross-validation judges must have votes");
    if (cross.some((vote) => vote?.state !== "measured")) {
      for (const state of [
        "invalid",
        "failed",
        "unavailable",
        "abstained",
      ] as const)
        if (cross.some((vote) => vote?.state === state)) return { state };
      return { state: "unavailable" };
    }
    const measuredCross = cross as Extract<JudgeVote, { state: "measured" }>[];
    return measuredCross.every((vote) => vote.verdict === left.verdict)
      ? { state: "measured", verdict: left.verdict }
      : { state: "disagreement" };
  }
  for (const state of [
    "invalid",
    "failed",
    "unavailable",
    "abstained",
  ] as const)
    if (primary.some((vote) => vote?.state === state)) return { state };
  return { state: "unavailable" };
}

function parseJudgmentInput(value: unknown): JudgmentSemanticInput {
  const parsed = record(value, "judgment input");
  exact(
    parsed,
    [
      "release",
      "judgmentId",
      "trialIds",
      "caseId",
      "runReceiptDigests",
      "mode",
      "dimension",
      "orientation",
      "artifactDigests",
      "artifactValidationDigests",
      "rubricDigest",
      "rubricProjectionId",
      "rubricProjectionDigest",
      "judgeConfigurationDigest",
      "primaryJudges",
      "crossValidationJudges",
      "votes",
    ],
    "judgment input",
  );
  const mode = literal(
    parsed.mode,
    ["pointwise", "pairwise"] as const,
    "judgment.mode",
  );
  const orientation =
    parsed.orientation === null
      ? null
      : literal(
          parsed.orientation,
          ["canonical", "mirrored"] as const,
          "judgment.orientation",
        );
  if ((mode === "pointwise") !== (orientation === null))
    throw new TypeError(
      "pointwise orientation is null and pairwise orientation is explicit",
    );
  const artifactDigests = items(
    parsed.artifactDigests,
    "judgment.artifactDigests",
  ).map((entry, index) => digest(entry, `judgment.artifactDigests[${index}]`));
  if (artifactDigests.length !== (mode === "pointwise" ? 1 : 2))
    throw new TypeError("judgment artifact count must match its mode");
  const artifactValidationDigests = items(
    parsed.artifactValidationDigests,
    "judgment.artifactValidationDigests",
  ).map((entry, index) =>
    digest(entry, `judgment.artifactValidationDigests[${index}]`),
  );
  if (artifactValidationDigests.length !== artifactDigests.length)
    throw new TypeError(
      "judgment artifact validation evidence must match artifact cardinality",
    );
  const trialIds = strings(parsed.trialIds, "judgment.trialIds", {
    nonempty: true,
  });
  const runReceiptDigests = items(
    parsed.runReceiptDigests,
    "judgment.runReceiptDigests",
  ).map((entry, index) =>
    digest(entry, `judgment.runReceiptDigests[${index}]`),
  );
  if (
    trialIds.length !== artifactDigests.length ||
    runReceiptDigests.length !== artifactDigests.length
  ) {
    throw new TypeError(
      "judgment trials, run receipts, and artifacts must have equal cardinality",
    );
  }
  if (new Set(runReceiptDigests).size !== runReceiptDigests.length) {
    throw new TypeError("judgment run receipts must be distinct");
  }
  const votes = items(parsed.votes, "judgment.votes").map((entry, index) =>
    parseVote(entry, mode, index),
  );
  if (
    votes.length !== APPROVED_JUDGE_MODELS.length ||
    JSON.stringify(votes.map(({ model }) => model).sort()) !==
      JSON.stringify([...APPROVED_JUDGE_MODELS].sort())
  )
    throw new TypeError(
      "judgment requires exactly one vote from each approved model",
    );
  const primaryJudges = items(
    parsed.primaryJudges,
    "judgment.primaryJudges",
  ).map((model, index) =>
    literal(model, PRIMARY_JUDGE_MODELS, `judgment.primaryJudges[${index}]`),
  );
  if (
    primaryJudges.length !== 2 ||
    new Set(primaryJudges).size !== primaryJudges.length ||
    JSON.stringify(primaryJudges) !== JSON.stringify(PRIMARY_JUDGE_MODELS)
  )
    throw new TypeError("judgment requires two distinct primary judges");
  const crossValidationJudges = items(
    parsed.crossValidationJudges,
    "judgment.crossValidationJudges",
  ).map((model, index) =>
    literal(
      model,
      CROSS_VALIDATION_JUDGE_MODELS,
      `judgment.crossValidationJudges[${index}]`,
    ),
  );
  if (
    JSON.stringify(crossValidationJudges) !==
    JSON.stringify(CROSS_VALIDATION_JUDGE_MODELS)
  )
    throw new TypeError(
      "judgment requires the frozen cross-validation judge set",
    );
  return {
    release: literal(parsed.release, [RELEASE_ID], "judgment.release"),
    judgmentId: string(parsed.judgmentId, "judgment.judgmentId"),
    trialIds,
    caseId: string(parsed.caseId, "judgment.caseId"),
    runReceiptDigests,
    mode,
    dimension: literal(
      parsed.dimension,
      JUDGE_DIMENSIONS,
      "judgment.dimension",
    ),
    orientation,
    artifactDigests,
    artifactValidationDigests,
    rubricDigest: digest(parsed.rubricDigest, "judgment.rubricDigest"),
    rubricProjectionId: string(
      parsed.rubricProjectionId,
      "judgment.rubricProjectionId",
    ),
    rubricProjectionDigest: digest(
      parsed.rubricProjectionDigest,
      "judgment.rubricProjectionDigest",
    ),
    judgeConfigurationDigest: digest(
      parsed.judgeConfigurationDigest,
      "judgment.judgeConfigurationDigest",
    ),
    primaryJudges:
      primaryJudges as unknown as JudgmentSemanticInput["primaryJudges"],
    crossValidationJudges:
      crossValidationJudges as unknown as JudgmentSemanticInput["crossValidationJudges"],
    votes,
  };
}

export function createJudgmentRecord(
  inputValue: JudgmentSemanticInput,
): JudgmentRecord {
  const input = parseJudgmentInput(inputValue);
  const semantic = {
    ...input,
    outcome: resolveOutcome(
      input.votes,
      input.primaryJudges,
      input.crossValidationJudges,
    ),
  };
  return { ...semantic, recordDigest: stableDigest(semantic) };
}

export function parseJudgmentRecord(value: unknown): JudgmentRecord {
  const parsed = record(value, "judgment record");
  if (!("outcome" in parsed) || !("recordDigest" in parsed))
    throw new TypeError("judgment outcome and recordDigest are required");
  const {
    outcome: outcomeValue,
    recordDigest: _identity,
    ...inputValue
  } = parsed;
  const input = parseJudgmentInput(inputValue);
  const expected = resolveOutcome(
    input.votes,
    input.primaryJudges,
    input.crossValidationJudges,
  );
  if (JSON.stringify(outcomeValue) !== JSON.stringify(expected))
    throw new TypeError(
      "judgment outcome must be derived from its exact votes",
    );
  const semantic = { ...input, outcome: expected };
  return {
    ...semantic,
    recordDigest: verifyDigest(
      parsed,
      "recordDigest",
      semantic,
      "judgment record",
    ),
  };
}

export type Rate =
  | {
      readonly state: "measured";
      readonly numerator: number;
      readonly denominator: number;
      readonly value: number;
    }
  | {
      readonly state: "unmeasured";
      readonly numerator: 0;
      readonly denominator: 0;
      readonly value: null;
    };

export type Efficiency =
  | {
      readonly state: "measured";
      readonly samples: number;
      readonly durationMsMean: number;
      readonly inputTokensMean: number | null;
      readonly outputTokensMean: number | null;
      readonly costNanoUsdTotal: number | null;
    }
  | {
      readonly state: "unmeasured";
      readonly samples: 0;
      readonly durationMsMean: null;
      readonly inputTokensMean: null;
      readonly outputTokensMean: null;
      readonly costNanoUsdTotal: null;
    };

export interface FormReport {
  readonly split: Extract<BankSplit, "release_a" | "release_b">;
  readonly form: BenchmarkForm;
  readonly census: {
    readonly families: number;
    readonly measured: number;
    readonly receipts: Readonly<
      Partial<Record<"missing" | RunReceiptSemantic["state"], number>>
    >;
    readonly cleanup: Readonly<
      Partial<Record<"succeeded" | "failed" | "unavailable", number>>
    >;
    readonly judgments: Readonly<
      Partial<Record<"missing" | JudgmentOutcome["state"], number>>
    >;
    readonly family: Readonly<
      Partial<Record<"qualified" | "failed" | "unavailable", number>>
    >;
  };
  readonly targetAlignment: Rate;
  readonly taskUtility: Rate;
  readonly evidenceIntegrity: Rate;
  readonly targetSpecificity: Rate;
  readonly criticalFailureRate: Rate;
  readonly qpcfr: Rate;
  readonly efficiency: Efficiency;
  readonly caseCensus: readonly {
    readonly caseId: string;
    readonly familyId: string;
    readonly manifestDigest: Digest;
    readonly familyState: "qualified" | "failed" | "unavailable";
    readonly trials: readonly {
      readonly condition: BenchmarkCondition;
      readonly trialId: string | null;
      readonly receiptDigest: Digest | null;
      readonly receiptState: "missing" | RunReceiptSemantic["state"];
      readonly artifactValidationDigest: Digest | null;
      readonly session: SessionEvidence | null;
      readonly cleanup:
        "not_applicable" | "succeeded" | "failed" | "unavailable";
      readonly judgmentRecordDigests: readonly Digest[];
    }[];
  }[];
  readonly coverage: {
    readonly observedReceipts: number;
    readonly semanticEligibleReceipts: number;
    readonly judgedRecords: number;
    readonly numericFamilies: number;
  };
  readonly uncertainty: {
    readonly unmeasuredFamilies: number;
    readonly qpcfrLowerBound: number;
    readonly qpcfrUpperBound: number;
  };
}

export interface BenchmarkReportSemantic {
  readonly release: typeof RELEASE_ID;
  readonly benchCommit: string;
  readonly bankDigest: Digest;
  readonly candidate: CandidateIdentity;
  readonly provenance: {
    readonly bankId: string;
    readonly protocolDigest: Digest;
    readonly judgeConfigurationDigest: Digest;
  };
  readonly forms: readonly FormReport[];
}

export type BenchmarkReport = BenchmarkReportSemantic & {
  readonly reportDigest: Digest;
};

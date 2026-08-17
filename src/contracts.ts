import { stableDigest, type Digest } from "./digest.ts";

export { canonicalJson, stableDigest, type Digest } from "./digest.ts";

export const RELEASE_ID = "2026.8.17" as const;
export const BENCHMARK_FORMS = ["dialogue", "professional_artifact"] as const;
export const BANK_SPLITS = ["public"] as const;
export const BENCHMARK_CONDITIONS = [
  "unconditioned",
  "target_a",
  "target_b",
] as const;
export const TRANSFER_TYPES = [
  "near_transfer",
  "far_transfer",
  "boundary",
  "policy_conflict",
] as const;
export const TASK_ARCHETYPES = [
  "recommendation",
  "allocation_prioritization",
  "design_threshold",
  "critique_revision",
] as const;
export const TASK_MODES = ["bounded", "open_ended"] as const;
export const HISTORY_FORMATS = [
  "decision_note",
  "message_excerpt",
  "retrospective",
  "structured_log",
] as const;

export type BenchmarkForm = (typeof BENCHMARK_FORMS)[number];
export type BenchmarkCondition = (typeof BENCHMARK_CONDITIONS)[number];
export type TransferType = (typeof TRANSFER_TYPES)[number];
export type TaskArchetype = (typeof TASK_ARCHETYPES)[number];
export type TaskMode = (typeof TASK_MODES)[number];
export type HistoryFormat = (typeof HISTORY_FORMATS)[number];
export type BankSplit = "public";

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  return value as JsonRecord;
}

function exact(value: JsonRecord, keys: readonly string[], label: string) {
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...keys].sort())
  )
    throw new TypeError(
      `${label} must contain exactly ${[...keys].sort().join(", ")}`,
    );
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new TypeError(`${label} must be an integer >= ${minimum}`);
  return value as number;
}

function literal<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !choices.includes(value))
    throw new TypeError(`${label} must be one of ${choices.join(", ")}`);
  return value as T[number];
}

function digest(value: unknown, label: string): Digest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} must be a sha256 digest`);
  return value as Digest;
}

function strings(value: unknown, label: string, nonempty = false): string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const parsed = value.map((entry, index) =>
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
  field: string,
  semantic: unknown,
  label: string,
): Digest {
  const actual = digest(value[field], `${label}.${field}`);
  if (actual !== stableDigest(semantic))
    throw new TypeError(`${label}.${field} does not match its content`);
  return actual;
}

export interface HistoryRecord {
  readonly id: string;
  readonly format: HistoryFormat;
  readonly content: string;
}

export interface CaseManifestSemantic {
  readonly release: typeof RELEASE_ID;
  readonly caseId: string;
  readonly pairId: string;
  readonly form: BenchmarkForm;
  readonly domain: string;
  readonly transferType: TransferType;
  readonly taskArchetype: TaskArchetype;
  readonly taskMode: TaskMode;
  readonly split: "public";
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
    Record<BenchmarkCondition, readonly HistoryRecord[]>
  >;
  readonly lineage: {
    readonly sourceIds: readonly string[];
    readonly templateId: string;
  };
}

export type CaseManifest = CaseManifestSemantic & {
  readonly manifestDigest: Digest;
};

function parseHistoryRecord(value: unknown, label: string): HistoryRecord {
  const parsed = record(value, label);
  exact(parsed, ["id", "format", "content"], label);
  return {
    id: string(parsed.id, `${label}.id`),
    format: literal(parsed.format, HISTORY_FORMATS, `${label}.format`),
    content: string(parsed.content, `${label}.content`),
  };
}

function parseHistory(
  value: unknown,
  label: string,
  required: boolean,
): HistoryRecord[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const history = value.map((entry, index) =>
    parseHistoryRecord(entry, `${label}[${index}]`),
  );
  if (required && history.length !== 8)
    throw new TypeError(`${label} must contain exactly 8 records`);
  if (!required && history.length !== 0)
    throw new TypeError(`${label} must be empty`);
  if (new Set(history.map(({ id }) => id)).size !== history.length)
    throw new TypeError(`${label} record IDs must be unique`);
  return history;
}

function parseCaseSemantic(value: unknown): CaseManifestSemantic {
  const parsed = record(value, "case manifest semantic");
  exact(
    parsed,
    [
      "release",
      "caseId",
      "pairId",
      "form",
      "domain",
      "transferType",
      "taskArchetype",
      "taskMode",
      "split",
      "task",
      "evidence",
      "contexts",
      "lineage",
    ],
    "case manifest semantic",
  );
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
  if (!Array.isArray(parsed.evidence))
    throw new TypeError("case manifest.evidence must be an array");
  const evidence = parsed.evidence.map((entry, index) => {
    const item = record(entry, `case manifest.evidence[${index}]`);
    exact(
      item,
      ["id", "content", "source", "license"],
      `case manifest.evidence[${index}]`,
    );
    return {
      id: string(item.id, `case manifest.evidence[${index}].id`),
      content: string(item.content, `case manifest.evidence[${index}].content`),
      source: string(item.source, `case manifest.evidence[${index}].source`),
      license: literal(
        item.license,
        ["MIT"] as const,
        `case manifest.evidence[${index}].license`,
      ),
    };
  });
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
      parseHistory(
        contexts[condition],
        `case manifest.contexts.${condition}`,
        condition !== "unconditioned",
      ),
    ]),
  ) as unknown as CaseManifestSemantic["contexts"];
  const lineage = record(parsed.lineage, "case manifest.lineage");
  exact(lineage, ["sourceIds", "templateId"], "case manifest.lineage");
  return {
    release: literal(parsed.release, [RELEASE_ID], "case manifest.release"),
    caseId: string(parsed.caseId, "case manifest.caseId"),
    pairId: string(parsed.pairId, "case manifest.pairId"),
    form: literal(parsed.form, BENCHMARK_FORMS, "case manifest.form"),
    domain: string(parsed.domain, "case manifest.domain"),
    transferType: literal(
      parsed.transferType,
      TRANSFER_TYPES,
      "case manifest.transferType",
    ),
    taskArchetype: literal(
      parsed.taskArchetype,
      TASK_ARCHETYPES,
      "case manifest.taskArchetype",
    ),
    taskMode: literal(parsed.taskMode, TASK_MODES, "case manifest.taskMode"),
    split: "public",
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
      sourceIds: strings(
        lineage.sourceIds,
        "case manifest.lineage.sourceIds",
        true,
      ),
      templateId: string(
        lineage.templateId,
        "case manifest.lineage.templateId",
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
  exact(
    parsed,
    [
      "release",
      "caseId",
      "pairId",
      "form",
      "domain",
      "transferType",
      "taskArchetype",
      "taskMode",
      "split",
      "task",
      "evidence",
      "contexts",
      "lineage",
      "manifestDigest",
    ],
    "case manifest",
  );
  const { manifestDigest: _ignored, ...semanticValue } = parsed;
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
  readonly candidateKind: "agent";
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

export function createCandidateIdentity(
  value: CandidateSemantic,
): CandidateIdentity {
  const semantic = { ...value };
  return { ...semantic, candidateDigest: stableDigest(semantic) };
}

export function parseCandidateIdentity(value: unknown): CandidateIdentity {
  const parsed = record(value, "candidate identity");
  exact(
    parsed,
    [
      "candidateKind",
      "candidateId",
      "harness",
      "model",
      "host",
      "adaptation",
      "configurationDigest",
      "toolPolicyDigest",
      "candidateDigest",
    ],
    "candidate identity",
  );
  const { candidateDigest: _ignored, ...semantic } = parsed;
  const parsedSemantic = {
    candidateKind: literal(
      semantic.candidateKind,
      ["agent"] as const,
      "candidate.candidateKind",
    ),
    candidateId: string(semantic.candidateId, "candidate.candidateId"),
    harness: string(semantic.harness, "candidate.harness"),
    model: string(semantic.model, "candidate.model"),
    host: string(semantic.host, "candidate.host"),
    adaptation: string(semantic.adaptation, "candidate.adaptation"),
    configurationDigest: digest(
      semantic.configurationDigest,
      "candidate.configurationDigest",
    ),
    toolPolicyDigest: digest(
      semantic.toolPolicyDigest,
      "candidate.toolPolicyDigest",
    ),
  } satisfies CandidateSemantic;
  return {
    ...parsedSemantic,
    candidateDigest: verifyDigest(
      parsed,
      "candidateDigest",
      parsedSemantic,
      "candidate",
    ),
  };
}

export type ExecutionEvidence =
  | {
      readonly kind: "conversation";
      readonly hostReceiptDigest: Digest;
      readonly transcriptDigest: Digest;
      readonly turnCount: number;
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

export type RunReceiptSemantic = {
  readonly release: typeof RELEASE_ID;
  readonly benchCommit: string;
  readonly bankDigest: Digest;
  readonly trialId: string;
  readonly caseId: string;
  readonly taskDigest: Digest;
  readonly condition: BenchmarkCondition;
  readonly candidate: CandidateIdentity;
  readonly execution: ExecutionEvidence | null;
} & (
  | {
      readonly state: "succeeded";
      readonly artifact: {
        readonly digest: Digest;
        readonly bytes: number;
        readonly mediaType: "text/plain";
        readonly validationDigest: Digest;
      };
      readonly durationMs: number;
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
      ["kind", "hostReceiptDigest", "transcriptDigest", "turnCount", "cleanup"],
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

function parseRunReceiptSemantic(value: unknown): RunReceiptSemantic {
  const parsed = record(value, "run receipt");
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
  const common = [
    "release",
    "benchCommit",
    "bankDigest",
    "trialId",
    "caseId",
    "taskDigest",
    "condition",
    "candidate",
    "execution",
    "state",
  ];
  exact(
    parsed,
    state === "succeeded"
      ? [...common, "artifact", "durationMs"]
      : [...common, "cause"],
    "run receipt",
  );
  const base = {
    release: literal(parsed.release, [RELEASE_ID], "run receipt.release"),
    benchCommit: string(parsed.benchCommit, "run receipt.benchCommit"),
    bankDigest: digest(parsed.bankDigest, "run receipt.bankDigest"),
    trialId: string(parsed.trialId, "run receipt.trialId"),
    caseId: string(parsed.caseId, "run receipt.caseId"),
    taskDigest: digest(parsed.taskDigest, "run receipt.taskDigest"),
    condition: literal(
      parsed.condition,
      BENCHMARK_CONDITIONS,
      "run receipt.condition",
    ),
    candidate: parseCandidateIdentity(parsed.candidate),
    execution: parseExecution(parsed.execution),
  };
  if (state !== "succeeded")
    return { ...base, state, cause: string(parsed.cause, "run receipt.cause") };
  if (base.execution === null)
    throw new TypeError("successful run receipt requires execution evidence");
  const artifact = record(parsed.artifact, "run receipt.artifact");
  exact(
    artifact,
    ["digest", "bytes", "mediaType", "validationDigest"],
    "run receipt.artifact",
  );
  return {
    ...base,
    state,
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
    durationMs: integer(parsed.durationMs, "run receipt.durationMs"),
  };
}

export function createRunReceipt(value: RunReceiptSemantic): RunReceipt {
  const semantic = parseRunReceiptSemantic(value);
  return { ...semantic, receiptDigest: stableDigest(semantic) };
}

export function parseRunReceipt(value: unknown): RunReceipt {
  const parsed = record(value, "run receipt");
  if (!("receiptDigest" in parsed))
    throw new TypeError("run receipt.receiptDigest is required");
  const { receiptDigest: _ignored, ...semanticValue } = parsed;
  const semantic = parseRunReceiptSemantic(semanticValue);
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

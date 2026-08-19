import { TextDecoder } from "node:util";

import {
  BENCHMARK_CONDITIONS,
  RELEASE_ID,
  parseCaseManifest,
  stableDigest,
  type BenchmarkCondition,
  type CaseManifest,
  type Digest,
} from "./contracts.ts";

export interface CandidateTask {
  readonly release: typeof RELEASE_ID;
  readonly instruction: string;
  readonly environment: CaseManifest["task"]["environment"];
  readonly deliverables: CaseManifest["task"]["deliverables"];
  readonly hardConstraints: CaseManifest["task"]["hardConstraints"];
  readonly output: CaseManifest["task"]["output"];
  readonly documents: CaseManifest["documents"];
  readonly context: readonly {
    readonly id: string;
    readonly format: CaseManifest["contexts"]["target_a"][number]["format"];
    readonly content: string;
  }[];
  readonly taskDigest: Digest;
}

export interface CandidateArtifact {
  readonly mediaType: "text/plain";
  readonly content: string;
}

export interface DecisionRecord {
  readonly decision: string;
  readonly evidenceUse: readonly {
    readonly sourceId: string;
    readonly use: string;
  }[];
  readonly tradeoffs: readonly {
    readonly factors: readonly [string, string];
    readonly resolution: string;
  }[];
  readonly constraints: readonly {
    readonly constraint: string;
    readonly handling: string;
  }[];
  readonly uncertainty: string | null;
}

export interface CandidateSubmission {
  readonly artifact: CandidateArtifact;
  readonly decisionRecord: DecisionRecord;
}

export const DECISION_RECORD_MAX_BYTES = 16_384;

export function renderCase(
  manifestValue: CaseManifest,
  selection: { readonly condition: BenchmarkCondition },
): CandidateTask {
  const manifest = parseCaseManifest(manifestValue);
  if (!BENCHMARK_CONDITIONS.includes(selection.condition))
    throw new TypeError(
      `condition must be one of ${BENCHMARK_CONDITIONS.join(", ")}`,
    );
  const semantic = {
    release: RELEASE_ID,
    instruction: manifest.task.instruction,
    environment: manifest.task.environment,
    deliverables: manifest.task.deliverables,
    hardConstraints: manifest.task.hardConstraints,
    output: manifest.task.output,
    documents: manifest.documents,
    context: manifest.contexts[selection.condition],
  };
  return {
    ...semantic,
    taskDigest: stableDigest(semantic),
  };
}

export type ArtifactValidation =
  | {
      readonly state: "valid";
      readonly artifact: {
        readonly digest: Digest;
        readonly bytes: number;
        readonly mediaType: "text/plain";
        readonly validationDigest: Digest;
      };
    }
  | { readonly state: "invalid"; readonly cause: string };

export type CandidateSubmissionValidation =
  | {
      readonly state: "valid";
      readonly artifact: Extract<
        ArtifactValidation,
        { readonly state: "valid" }
      >["artifact"];
      readonly decisionRecord: {
        readonly digest: Digest;
        readonly bytes: number;
        readonly sourceIds: readonly string[];
      };
      readonly submissionDigest: Digest;
    }
  | { readonly state: "invalid"; readonly cause: string };

export function artifactDigest(
  bytes: Uint8Array,
  mediaType: "text/plain" = "text/plain",
): Digest {
  return stableDigest({
    mediaType,
    bytesBase64: Buffer.from(bytes).toString("base64"),
  });
}

export function validateArtifact(
  manifestValue: CaseManifest,
  bytes: Uint8Array,
): ArtifactValidation {
  const manifest = parseCaseManifest(manifestValue);
  return validateOutputContract(
    manifest.task.output,
    bytes,
    manifest.manifestDigest,
  );
}

export function validateCandidateArtifact(
  task: CandidateTask,
  bytes: Uint8Array,
): ArtifactValidation {
  return validateOutputContract(task.output, bytes, task.taskDigest);
}

type JsonRecord = Record<string, unknown>;

function object(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  return value as JsonRecord;
}

function exact(value: JsonRecord, keys: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new TypeError(`${label} must contain exactly ${expected.join(", ")}`);
}

function nonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function nonemptyArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new TypeError(`${label} must be a non-empty array`);
  return value;
}

function parseCandidateSubmission(value: unknown): CandidateSubmission {
  const submission = object(value, "submission");
  exact(submission, ["artifact", "decisionRecord"], "submission");

  const artifact = object(submission.artifact, "artifact");
  exact(artifact, ["mediaType", "content"], "artifact");
  if (artifact.mediaType !== "text/plain")
    throw new TypeError("artifact.mediaType must be text/plain");
  const content = nonemptyString(artifact.content, "artifact.content");

  const rawDecisionRecord = object(submission.decisionRecord, "decisionRecord");
  exact(
    rawDecisionRecord,
    ["decision", "evidenceUse", "tradeoffs", "constraints", "uncertainty"],
    "decisionRecord",
  );
  const evidenceUse = nonemptyArray(
    rawDecisionRecord.evidenceUse,
    "decisionRecord.evidenceUse",
  ).map((entry, index) => {
    const parsed = object(entry, `decisionRecord.evidenceUse[${index}]`);
    exact(parsed, ["sourceId", "use"], `decisionRecord.evidenceUse[${index}]`);
    return {
      sourceId: nonemptyString(
        parsed.sourceId,
        `decisionRecord.evidenceUse[${index}].sourceId`,
      ),
      use: nonemptyString(
        parsed.use,
        `decisionRecord.evidenceUse[${index}].use`,
      ),
    };
  });
  if (
    new Set(evidenceUse.map(({ sourceId }) => sourceId)).size !==
    evidenceUse.length
  )
    throw new TypeError(
      "decisionRecord.evidenceUse sourceId values must be unique",
    );

  const tradeoffs = nonemptyArray(
    rawDecisionRecord.tradeoffs,
    "decisionRecord.tradeoffs",
  ).map((entry, index) => {
    const parsed = object(entry, `decisionRecord.tradeoffs[${index}]`);
    exact(
      parsed,
      ["factors", "resolution"],
      `decisionRecord.tradeoffs[${index}]`,
    );
    if (!Array.isArray(parsed.factors) || parsed.factors.length !== 2)
      throw new TypeError(
        `decisionRecord.tradeoffs[${index}].factors must contain exactly two strings`,
      );
    return {
      factors: [
        nonemptyString(
          parsed.factors[0],
          `decisionRecord.tradeoffs[${index}].factors[0]`,
        ),
        nonemptyString(
          parsed.factors[1],
          `decisionRecord.tradeoffs[${index}].factors[1]`,
        ),
      ] as const,
      resolution: nonemptyString(
        parsed.resolution,
        `decisionRecord.tradeoffs[${index}].resolution`,
      ),
    };
  });

  const constraints = nonemptyArray(
    rawDecisionRecord.constraints,
    "decisionRecord.constraints",
  ).map((entry, index) => {
    const parsed = object(entry, `decisionRecord.constraints[${index}]`);
    exact(
      parsed,
      ["constraint", "handling"],
      `decisionRecord.constraints[${index}]`,
    );
    return {
      constraint: nonemptyString(
        parsed.constraint,
        `decisionRecord.constraints[${index}].constraint`,
      ),
      handling: nonemptyString(
        parsed.handling,
        `decisionRecord.constraints[${index}].handling`,
      ),
    };
  });

  const uncertainty =
    rawDecisionRecord.uncertainty === null
      ? null
      : nonemptyString(
          rawDecisionRecord.uncertainty,
          "decisionRecord.uncertainty",
        );
  return {
    artifact: { mediaType: "text/plain", content },
    decisionRecord: {
      decision: nonemptyString(
        rawDecisionRecord.decision,
        "decisionRecord.decision",
      ),
      evidenceUse,
      tradeoffs,
      constraints,
      uncertainty,
    },
  };
}

export function validateCandidateSubmission(
  task: CandidateTask,
  value: unknown,
): CandidateSubmissionValidation {
  let submission: CandidateSubmission;
  try {
    submission = parseCandidateSubmission(value);
  } catch (error) {
    return {
      state: "invalid",
      cause: error instanceof Error ? error.message : String(error),
    };
  }

  const bytes = new TextEncoder().encode(submission.artifact.content);
  const artifact = validateCandidateArtifact(task, bytes);
  if (artifact.state === "invalid") return artifact;

  const visibleSourceIds = new Set([
    ...task.documents.map(({ documentId }) => documentId),
    ...task.context.map(({ id }) => id),
  ]);
  for (const [
    index,
    { sourceId },
  ] of submission.decisionRecord.evidenceUse.entries())
    if (!visibleSourceIds.has(sourceId))
      return {
        state: "invalid",
        cause: `decisionRecord.evidenceUse[${index}].sourceId is not visible to the candidate`,
      };

  const decisionRecordBytes = Buffer.byteLength(
    JSON.stringify(submission.decisionRecord),
    "utf8",
  );
  if (decisionRecordBytes > DECISION_RECORD_MAX_BYTES)
    return {
      state: "invalid",
      cause: `decisionRecord exceeds ${DECISION_RECORD_MAX_BYTES} bytes`,
    };
  const decisionRecordDigest = stableDigest(submission.decisionRecord);
  return {
    state: "valid",
    artifact: artifact.artifact,
    decisionRecord: {
      digest: decisionRecordDigest,
      bytes: decisionRecordBytes,
      sourceIds: submission.decisionRecord.evidenceUse.map(
        ({ sourceId }) => sourceId,
      ),
    },
    submissionDigest: stableDigest({
      artifactDigest: artifact.artifact.digest,
      decisionRecordDigest,
    }),
  };
}

function validateOutputContract(
  output: CandidateTask["output"],
  bytes: Uint8Array,
  validationSeed: Digest,
): ArtifactValidation {
  if (bytes.length > output.maxBytes)
    return {
      state: "invalid",
      cause: `artifact exceeds ${output.maxBytes} bytes`,
    };
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  )
    return {
      state: "invalid",
      cause: "artifact must be UTF-8 without a byte-order mark",
    };
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { state: "invalid", cause: "artifact must be valid UTF-8" };
  }
  for (const referenceId of output.requiredReferenceIds)
    if (!text.includes(`[${referenceId}]`))
      return {
        state: "invalid",
        cause: `missing required reference ${referenceId}`,
      };
  const digest = artifactDigest(bytes, output.mediaType);
  return {
    state: "valid",
    artifact: {
      digest,
      bytes: bytes.length,
      mediaType: output.mediaType,
      validationDigest: stableDigest({
        validationSeed,
        artifact: {
          digest,
          bytes: bytes.length,
          mediaType: output.mediaType,
        },
      }),
    },
  };
}

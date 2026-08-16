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
  readonly trialId: string;
  readonly caseId: string;
  readonly instruction: string;
  readonly environment: CaseManifest["task"]["environment"];
  readonly output: CaseManifest["task"]["output"];
  readonly evidence: CaseManifest["evidence"];
  readonly context: readonly {
    readonly id: string;
    readonly content: string;
  }[];
  readonly taskDigest: Digest;
}

export function renderCase(
  manifestValue: CaseManifest,
  selection: {
    readonly trialId: string;
    readonly condition: BenchmarkCondition;
  },
): CandidateTask {
  const manifest = parseCaseManifest(manifestValue);
  if (selection.trialId.trim() === "")
    throw new TypeError("trialId must be non-empty");
  if (!BENCHMARK_CONDITIONS.includes(selection.condition))
    throw new TypeError(
      `condition must be one of ${BENCHMARK_CONDITIONS.join(", ")}`,
    );
  const semantic = {
    release: RELEASE_ID,
    trialId: selection.trialId,
    caseId: manifest.caseId,
    instruction: manifest.task.instruction,
    environment: manifest.task.environment,
    output: manifest.task.output,
    evidence: manifest.evidence,
    context: manifest.contexts[selection.condition],
  };
  return { ...semantic, taskDigest: stableDigest(semantic) };
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
  if (bytes.length > manifest.task.output.maxBytes)
    return {
      state: "invalid",
      cause: `artifact exceeds ${manifest.task.output.maxBytes} bytes`,
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
  for (const referenceId of manifest.task.output.requiredReferenceIds)
    if (!text.includes(`[${referenceId}]`))
      return {
        state: "invalid",
        cause: `missing required reference ${referenceId}`,
      };
  return {
    state: "valid",
    artifact: {
      digest: artifactDigest(bytes, manifest.task.output.mediaType),
      bytes: bytes.length,
      mediaType: manifest.task.output.mediaType,
      validationDigest: stableDigest({
        manifestDigest: manifest.manifestDigest,
        artifact: {
          digest: artifactDigest(bytes, manifest.task.output.mediaType),
          bytes: bytes.length,
          mediaType: manifest.task.output.mediaType,
        },
      }),
    },
  };
}

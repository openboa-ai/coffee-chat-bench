import {
  CONDITION_LABELS,
  RELEASE_ID,
  type ConditionLabel,
} from "./contracts.ts";
import { stableDigest, type Digest } from "./digest.ts";

export { stableDigest } from "./digest.ts";

export interface TrialIdentityInput {
  readonly release: "2026.8.12";
  readonly benchmarkCommit: string;
  readonly bankDigest: Digest;
  readonly caseId: string;
  readonly condition: ConditionLabel;
  readonly candidateDigest: Digest;
  readonly harnessDigest: Digest;
  readonly modelDigest: Digest;
  readonly hostDigest: Digest;
  readonly repetition: number;
}

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

function requireDigest(name: string, value: string): void {
  if (!DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a sha256 digest`);
  }
}

export function createTrialIdentity(input: TrialIdentityInput): string {
  if (input.release !== RELEASE_ID) {
    throw new TypeError(`release must be ${RELEASE_ID}`);
  }
  if (!COMMIT_PATTERN.test(input.benchmarkCommit)) {
    throw new TypeError(
      "benchmarkCommit must be a 40-character lowercase commit",
    );
  }
  requireDigest("bankDigest", input.bankDigest);
  requireDigest("candidateDigest", input.candidateDigest);
  requireDigest("harnessDigest", input.harnessDigest);
  requireDigest("modelDigest", input.modelDigest);
  requireDigest("hostDigest", input.hostDigest);
  if (input.caseId.length === 0)
    throw new TypeError("caseId must not be empty");
  if (!CONDITION_LABELS.includes(input.condition)) {
    throw new TypeError("condition must be T0, T1-A, or T1-B");
  }
  if (!Number.isSafeInteger(input.repetition) || input.repetition < 0) {
    throw new TypeError("repetition must be a non-negative safe integer");
  }

  const digest = stableDigest({
    bankDigest: input.bankDigest,
    benchmarkCommit: input.benchmarkCommit,
    candidateDigest: input.candidateDigest,
    caseId: input.caseId,
    condition: input.condition,
    harnessDigest: input.harnessDigest,
    hostDigest: input.hostDigest,
    modelDigest: input.modelDigest,
    release: input.release,
    repetition: input.repetition,
  });
  return `trial-${digest.slice("sha256:".length)}`;
}

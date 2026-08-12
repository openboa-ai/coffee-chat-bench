import { stableDigest, type Digest } from "./digest.ts";

export type { Digest } from "./digest.ts";

export const RELEASE_ID = "2026.8.12" as const;

export const CONDITION_LABELS = ["T0", "T1-A", "T1-B"] as const;
export type ConditionLabel = (typeof CONDITION_LABELS)[number];

export const RESULT_STATES = [
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
] as const;
export type ResultState = (typeof RESULT_STATES)[number];

export interface TaskContract {
  readonly instruction: string;
  readonly deliverable: string;
}

export interface EvidenceItem {
  readonly ref: string;
  readonly content: string;
  readonly digest: Digest;
}

export interface PerspectiveInput {
  readonly id: string;
  readonly pairId: string;
  readonly content: string;
  readonly digest: Digest;
}

export interface CasePerspectives {
  readonly A: PerspectiveInput;
  readonly B: PerspectiveInput;
  readonly irrelevant: PerspectiveInput;
}

export interface AcceptedRegions {
  readonly T0: readonly string[];
  readonly "T1-A": readonly string[];
  readonly "T1-B": readonly string[];
}

export interface CaseDecision {
  readonly decisionId: string;
  readonly prompt: string;
  readonly regionOptions: readonly string[];
  readonly partition: "sensitive" | "invariant";
  readonly acceptedRegions: AcceptedRegions;
  readonly requiredEvidenceRefs: readonly string[];
}

export interface CaseBundle {
  readonly release: typeof RELEASE_ID;
  readonly caseId: string;
  readonly familyId: string;
  readonly domain: string;
  readonly operation: string;
  readonly difficulty: string;
  readonly task: TaskContract;
  readonly sourceDigest: Digest;
  readonly evidence: readonly EvidenceItem[];
  readonly perspectives: CasePerspectives;
  readonly decisions: readonly CaseDecision[];
  readonly nonGoal: string;
}

export function caseSourceDigest(caseBundle: CaseBundle): Digest {
  const { sourceDigest: _sourceDigest, ...semanticFields } = caseBundle;
  return stableDigest(semanticFields);
}

export interface ManifestDecision {
  readonly decisionId: string;
  readonly selectedRegion: string;
  readonly evidenceRefs: readonly string[];
}

export interface DecisionManifest {
  readonly release: typeof RELEASE_ID;
  readonly trialId: string;
  readonly caseId: string;
  readonly condition: ConditionLabel;
  readonly artifactDigest: Digest;
  readonly decisions: readonly ManifestDecision[];
}

export interface QualificationDimensions {
  readonly taskAdequate: boolean;
  readonly evidenceIntegrity: boolean;
  readonly perspectiveAligned: boolean;
  readonly invariantsPreserved: boolean;
  readonly criticalFailure: boolean;
}

export type JudgeVote =
  | {
      readonly release: typeof RELEASE_ID;
      readonly trialId: string;
      readonly judgeId: string;
      readonly requestedModelId: string;
      readonly resolvedModelId: string;
      readonly promptDigest: Digest;
      readonly responseDigest: Digest;
      readonly state: "measured";
      readonly dimensions: QualificationDimensions;
      readonly evidenceRefs: readonly string[];
    }
  | {
      readonly release: typeof RELEASE_ID;
      readonly trialId: string;
      readonly judgeId: string;
      readonly requestedModelId: string;
      readonly state: "judge_unavailable";
      readonly reason: string;
      readonly evidenceRefs: readonly string[];
    };

export interface EfficiencySample {
  readonly wallTimeMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface TrialDecisionOutcome extends ManifestDecision {
  readonly partition: "sensitive" | "invariant";
  readonly accepted: boolean;
  readonly evidenceComplete: boolean;
}

export interface TrialVerdict {
  readonly release: typeof RELEASE_ID;
  readonly trialId: string;
  readonly caseId: string;
  readonly familyId: string;
  readonly domain: string;
  readonly operation: string;
  readonly condition: ConditionLabel;
  readonly state: ResultState;
  readonly qualified: boolean | null;
  readonly dimensions: QualificationDimensions | null;
  readonly criticalFailure: boolean | null;
  readonly decisions: readonly TrialDecisionOutcome[];
  readonly evidenceRefs: readonly string[];
  readonly efficiency: EfficiencySample | null;
}

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const TRIAL_ID_PATTERN = /^trial-[0-9a-f]{64}$/;

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const keys = Object.keys(record);
  const unexpected = keys.filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !Object.hasOwn(record, key));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new TypeError(`${label} must have exactly: ${allowed.join(", ")}`);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireLiteral<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new TypeError(`${label} must be ${allowed.join(", ")}`);
  }
  return value as T;
}

function requireDigest(value: unknown, label: string): Digest {
  const digest = requireString(value, label);
  if (!DIGEST_PATTERN.test(digest)) {
    throw new TypeError(`${label} must be a sha256 digest`);
  }
  return digest as Digest;
}

function requireTrialId(value: unknown): string {
  const trialId = requireString(value, "trialId");
  if (!TRIAL_ID_PATTERN.test(trialId)) {
    throw new TypeError("trialId must be a stable trial identity");
  }
  return trialId;
}

function requireStringArray(
  value: unknown,
  label: string,
  allowEmpty = false,
): readonly string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new TypeError(
      `${label} must be a${allowEmpty ? "" : " non-empty"} array`,
    );
  }
  const result = value.map((entry, index) =>
    requireString(entry, `${label}[${index}]`),
  );
  if (new Set(result).size !== result.length) {
    throw new TypeError(`${label} values must be unique`);
  }
  return result;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be boolean`);
  }
  return value;
}

function requireContentDigest(
  content: string,
  digest: Digest,
  label: string,
): void {
  if (digest !== stableDigest(content)) {
    throw new TypeError(`${label} digest does not match content`);
  }
}

function parseTaskContract(value: unknown): TaskContract {
  const record = requireRecord(value, "task");
  requireExactKeys(record, ["instruction", "deliverable"], "task");
  return {
    instruction: requireString(record.instruction, "task.instruction"),
    deliverable: requireString(record.deliverable, "task.deliverable"),
  };
}

function parseEvidenceItem(value: unknown, index: number): EvidenceItem {
  const record = requireRecord(value, `evidence[${index}]`);
  const label = `evidence[${index}]`;
  requireExactKeys(record, ["ref", "content", "digest"], label);
  const item = {
    ref: requireString(record.ref, `evidence[${index}].ref`),
    content: requireString(record.content, `${label}.content`),
    digest: requireDigest(record.digest, `evidence[${index}].digest`),
  };
  requireContentDigest(item.content, item.digest, label);
  return item;
}

function parsePerspectiveInput(
  value: unknown,
  label: string,
): PerspectiveInput {
  const record = requireRecord(value, label);
  requireExactKeys(record, ["id", "pairId", "content", "digest"], label);
  const perspective = {
    id: requireString(record.id, `${label}.id`),
    pairId: requireString(record.pairId, `${label}.pairId`),
    content: requireString(record.content, `${label}.content`),
    digest: requireDigest(record.digest, `${label}.digest`),
  };
  requireContentDigest(perspective.content, perspective.digest, label);
  return perspective;
}

function parseCasePerspectives(value: unknown): CasePerspectives {
  const record = requireRecord(value, "perspectives");
  requireExactKeys(record, ["A", "B", "irrelevant"], "perspectives");
  const perspectives = {
    A: parsePerspectiveInput(record.A, "perspectives.A"),
    B: parsePerspectiveInput(record.B, "perspectives.B"),
    irrelevant: parsePerspectiveInput(
      record.irrelevant,
      "perspectives.irrelevant",
    ),
  };
  const ids = Object.values(perspectives).map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError("perspective IDs must be unique");
  }
  if (perspectives.A.pairId !== perspectives.B.pairId) {
    throw new TypeError("A and B perspectives must share pair provenance");
  }
  if (perspectives.irrelevant.pairId === perspectives.A.pairId) {
    throw new TypeError(
      "irrelevant perspective must have distinct pair provenance",
    );
  }
  return perspectives;
}

function parseAcceptedRegions(value: unknown): AcceptedRegions {
  const record = requireRecord(value, "acceptedRegions");
  requireExactKeys(record, CONDITION_LABELS, "acceptedRegions");
  return {
    T0: requireStringArray(record.T0, "acceptedRegions.T0"),
    "T1-A": requireStringArray(record["T1-A"], "acceptedRegions.T1-A"),
    "T1-B": requireStringArray(record["T1-B"], "acceptedRegions.T1-B"),
  };
}

function parseCaseDecision(value: unknown, index: number): CaseDecision {
  const label = `decisions[${index}]`;
  const record = requireRecord(value, label);
  requireExactKeys(
    record,
    [
      "decisionId",
      "prompt",
      "regionOptions",
      "partition",
      "acceptedRegions",
      "requiredEvidenceRefs",
    ],
    label,
  );
  return {
    decisionId: requireString(record.decisionId, `${label}.decisionId`),
    prompt: requireString(record.prompt, `${label}.prompt`),
    regionOptions: requireStringArray(
      record.regionOptions,
      `${label}.regionOptions`,
    ),
    partition: requireLiteral(
      record.partition,
      ["sensitive", "invariant"],
      `${label}.partition`,
    ),
    acceptedRegions: parseAcceptedRegions(record.acceptedRegions),
    requiredEvidenceRefs: requireStringArray(
      record.requiredEvidenceRefs,
      `${label}.requiredEvidenceRefs`,
    ),
  };
}

export function parseCaseBundle(value: unknown): CaseBundle {
  const record = requireRecord(value, "case bundle");
  requireExactKeys(
    record,
    [
      "release",
      "caseId",
      "familyId",
      "domain",
      "operation",
      "difficulty",
      "task",
      "sourceDigest",
      "evidence",
      "perspectives",
      "decisions",
      "nonGoal",
    ],
    "case bundle",
  );

  if (!Array.isArray(record.evidence) || record.evidence.length === 0) {
    throw new TypeError("evidence must be a non-empty array");
  }
  const evidence = record.evidence.map(parseEvidenceItem);
  const evidenceRefs = evidence.map((entry) => entry.ref);
  if (new Set(evidenceRefs).size !== evidenceRefs.length) {
    throw new TypeError("evidence refs must be unique");
  }

  if (!Array.isArray(record.decisions) || record.decisions.length === 0) {
    throw new TypeError("decisions must be a non-empty array");
  }
  const decisions = record.decisions.map(parseCaseDecision);
  const decisionIds = decisions.map((entry) => entry.decisionId);
  if (new Set(decisionIds).size !== decisionIds.length) {
    throw new TypeError("decision IDs must be unique");
  }
  const partitions = new Set(decisions.map((entry) => entry.partition));
  if (!partitions.has("sensitive") || !partitions.has("invariant")) {
    throw new TypeError(
      "decisions must include sensitive and invariant partitions",
    );
  }
  for (const decision of decisions) {
    const regionOptions = new Set(decision.regionOptions);
    for (const condition of CONDITION_LABELS) {
      for (const acceptedRegion of decision.acceptedRegions[condition]) {
        if (!regionOptions.has(acceptedRegion)) {
          throw new TypeError(
            `decision ${decision.decisionId} accepts undeclared region ${acceptedRegion}`,
          );
        }
      }
    }
    for (const evidenceRef of decision.requiredEvidenceRefs) {
      if (!evidenceRefs.includes(evidenceRef)) {
        throw new TypeError(
          `decision ${decision.decisionId} references unknown evidence ${evidenceRef}`,
        );
      }
    }
  }

  const caseBundle: CaseBundle = {
    release: requireLiteral(record.release, [RELEASE_ID], "release"),
    caseId: requireString(record.caseId, "caseId"),
    familyId: requireString(record.familyId, "familyId"),
    domain: requireString(record.domain, "domain"),
    operation: requireString(record.operation, "operation"),
    difficulty: requireString(record.difficulty, "difficulty"),
    task: parseTaskContract(record.task),
    sourceDigest: requireDigest(record.sourceDigest, "sourceDigest"),
    evidence,
    perspectives: parseCasePerspectives(record.perspectives),
    decisions,
    nonGoal: requireString(record.nonGoal, "nonGoal"),
  };
  if (caseBundle.sourceDigest !== caseSourceDigest(caseBundle)) {
    throw new TypeError("sourceDigest does not match semantic case content");
  }
  return caseBundle;
}

function parseManifestDecision(
  value: unknown,
  index: number,
): ManifestDecision {
  const label = `decisions[${index}]`;
  const record = requireRecord(value, label);
  requireExactKeys(
    record,
    ["decisionId", "selectedRegion", "evidenceRefs"],
    label,
  );
  return {
    decisionId: requireString(record.decisionId, `${label}.decisionId`),
    selectedRegion: requireString(
      record.selectedRegion,
      `${label}.selectedRegion`,
    ),
    evidenceRefs: requireStringArray(
      record.evidenceRefs,
      `${label}.evidenceRefs`,
      true,
    ),
  };
}

export function parseDecisionManifest(value: unknown): DecisionManifest {
  const record = requireRecord(value, "decision manifest");
  requireExactKeys(
    record,
    [
      "release",
      "trialId",
      "caseId",
      "condition",
      "artifactDigest",
      "decisions",
    ],
    "decision manifest",
  );
  if (!Array.isArray(record.decisions) || record.decisions.length === 0) {
    throw new TypeError("decisions must be a non-empty array");
  }
  const decisions = record.decisions.map(parseManifestDecision);
  if (
    new Set(decisions.map((entry) => entry.decisionId)).size !==
    decisions.length
  ) {
    throw new TypeError("decision IDs must be unique");
  }
  return {
    release: requireLiteral(record.release, [RELEASE_ID], "release"),
    trialId: requireTrialId(record.trialId),
    caseId: requireString(record.caseId, "caseId"),
    condition: requireLiteral(record.condition, CONDITION_LABELS, "condition"),
    artifactDigest: requireDigest(record.artifactDigest, "artifactDigest"),
    decisions,
  };
}

function parseDimensions(value: unknown): QualificationDimensions {
  const record = requireRecord(value, "dimensions");
  requireExactKeys(
    record,
    [
      "taskAdequate",
      "evidenceIntegrity",
      "perspectiveAligned",
      "invariantsPreserved",
      "criticalFailure",
    ],
    "dimensions",
  );
  return {
    taskAdequate: requireBoolean(record.taskAdequate, "taskAdequate"),
    evidenceIntegrity: requireBoolean(
      record.evidenceIntegrity,
      "evidenceIntegrity",
    ),
    perspectiveAligned: requireBoolean(
      record.perspectiveAligned,
      "perspectiveAligned",
    ),
    invariantsPreserved: requireBoolean(
      record.invariantsPreserved,
      "invariantsPreserved",
    ),
    criticalFailure: requireBoolean(record.criticalFailure, "criticalFailure"),
  };
}

export function parseJudgeVote(value: unknown): JudgeVote {
  const record = requireRecord(value, "judge vote");
  const state = requireLiteral(
    record.state,
    ["measured", "judge_unavailable"],
    "judge vote state",
  );

  if (state === "measured") {
    requireExactKeys(
      record,
      [
        "release",
        "trialId",
        "judgeId",
        "requestedModelId",
        "resolvedModelId",
        "promptDigest",
        "responseDigest",
        "state",
        "dimensions",
        "evidenceRefs",
      ],
      "measured judge vote",
    );
    return {
      release: requireLiteral(record.release, [RELEASE_ID], "release"),
      trialId: requireTrialId(record.trialId),
      judgeId: requireString(record.judgeId, "judgeId"),
      requestedModelId: requireString(
        record.requestedModelId,
        "requestedModelId",
      ),
      resolvedModelId: requireString(record.resolvedModelId, "resolvedModelId"),
      promptDigest: requireDigest(record.promptDigest, "promptDigest"),
      responseDigest: requireDigest(record.responseDigest, "responseDigest"),
      state,
      dimensions: parseDimensions(record.dimensions),
      evidenceRefs: requireStringArray(
        record.evidenceRefs,
        "evidenceRefs",
        true,
      ),
    };
  }

  requireExactKeys(
    record,
    [
      "release",
      "trialId",
      "judgeId",
      "requestedModelId",
      "state",
      "reason",
      "evidenceRefs",
    ],
    "judge_unavailable vote",
  );
  return {
    release: requireLiteral(record.release, [RELEASE_ID], "release"),
    trialId: requireTrialId(record.trialId),
    judgeId: requireString(record.judgeId, "judgeId"),
    requestedModelId: requireString(
      record.requestedModelId,
      "requestedModelId",
    ),
    state,
    reason: requireString(record.reason, "reason"),
    evidenceRefs: requireStringArray(record.evidenceRefs, "evidenceRefs", true),
  };
}

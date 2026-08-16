import { RELEASE_ID, stableDigest, type Digest } from "./contracts.ts";

export const ACTIVATION_GATES = [
  "publicRights",
  "bankIntegrity",
  "humanCriterion",
  "judgeQualification",
  "reliability",
  "contamination",
  "execution",
  "validity",
] as const;

export const ACTIVATION_EVIDENCE_STATES = [
  "passed",
  "missing",
  "partial",
  "failed",
  "unavailable",
  "inconclusive",
] as const;

export type ActivationGate = (typeof ACTIVATION_GATES)[number];
export type ActivationEvidenceState =
  (typeof ACTIVATION_EVIDENCE_STATES)[number];

export interface ActivationGateEvidence {
  readonly state: ActivationEvidenceState;
  readonly source: string;
  readonly note: string;
}

export interface ActivationAuditInput {
  readonly release: typeof RELEASE_ID;
  readonly bankDigest: Digest;
  readonly gates: Readonly<Record<ActivationGate, ActivationGateEvidence>>;
}

export interface ActivationAuditSemantic extends ActivationAuditInput {
  readonly repositoryStatus: "not_active";
  readonly decision: "not_ready" | "ready_for_review";
  readonly blockers: readonly ActivationGate[];
}

export type ActivationAudit = ActivationAuditSemantic & {
  readonly auditDigest: Digest;
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
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

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`${label} must be a non-empty string`);
  return value;
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

function digest(value: unknown, label: string): Digest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} must be a sha256 digest`);
  return value as Digest;
}

function parseGateEvidence(
  value: unknown,
  label: string,
): ActivationGateEvidence {
  const parsed = record(value, label);
  exact(parsed, ["state", "source", "note"], label);
  return {
    state: literal(parsed.state, ACTIVATION_EVIDENCE_STATES, `${label}.state`),
    source: string(parsed.source, `${label}.source`),
    note: string(parsed.note, `${label}.note`),
  };
}

function parseGates(
  value: unknown,
): Readonly<Record<ActivationGate, ActivationGateEvidence>> {
  const parsed = record(value, "activation.gates");
  exact(parsed, ACTIVATION_GATES, "activation.gates");
  return Object.fromEntries(
    ACTIVATION_GATES.map((gate) => [
      gate,
      parseGateEvidence(parsed[gate], `activation.gates.${gate}`),
    ]),
  ) as Record<ActivationGate, ActivationGateEvidence>;
}

export function parseActivationAuditInput(
  value: unknown,
): ActivationAuditInput {
  const parsed = record(value, "activation");
  exact(parsed, ["release", "bankDigest", "gates"], "activation");
  return {
    release: literal(parsed.release, [RELEASE_ID], "activation.release"),
    bankDigest: digest(parsed.bankDigest, "activation.bankDigest"),
    gates: parseGates(parsed.gates),
  };
}

export function createActivationAudit(
  value: ActivationAuditInput,
): ActivationAudit {
  const input = parseActivationAuditInput(value);
  const blockers = ACTIVATION_GATES.filter(
    (gate) => input.gates[gate].state !== "passed",
  );
  const semantic: ActivationAuditSemantic = {
    ...input,
    repositoryStatus: "not_active",
    decision: blockers.length === 0 ? "ready_for_review" : "not_ready",
    blockers,
  };
  return { ...semantic, auditDigest: stableDigest(semantic) };
}

export function parseActivationAudit(value: unknown): ActivationAudit {
  const parsed = record(value, "activation audit");
  exact(
    parsed,
    [
      "release",
      "bankDigest",
      "gates",
      "repositoryStatus",
      "decision",
      "blockers",
      "auditDigest",
    ],
    "activation audit",
  );
  const expected = createActivationAudit(
    parseActivationAuditInput({
      release: parsed.release,
      bankDigest: parsed.bankDigest,
      gates: parsed.gates,
    }),
  );
  if (
    parsed.repositoryStatus !== expected.repositoryStatus ||
    parsed.decision !== expected.decision ||
    JSON.stringify(parsed.blockers) !== JSON.stringify(expected.blockers) ||
    parsed.auditDigest !== expected.auditDigest
  )
    throw new TypeError("activation audit digest or decision is invalid");
  return expected;
}

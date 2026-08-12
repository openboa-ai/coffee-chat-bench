import { parseCaseBundle, RELEASE_ID, type CaseBundle } from "./contracts.ts";

export const ADMISSION_CHECK_NAMES = [
  "taskOnlyUnderdetermination",
  "perspectiveOnlyInsufficiency",
  "counterfactualShift",
  "locality",
  "irrelevantStability",
  "paraphraseInvariance",
  "antiEcho",
  "rights",
  "deterministicOraclePass",
  "deterministicNoOpFailure",
  "deterministicListAllFailure",
] as const;

export type AdmissionCheckName = (typeof ADMISSION_CHECK_NAMES)[number];
export type BankPartition =
  "development" | "calibration" | "release" | "bridge";
export type AdmissionModelId = "gpt-5.6-sol" | "gpt-5.6-terra" | "gpt-5.6-luna";

export interface AdmissionCheck {
  readonly passed: boolean;
  readonly reason: string;
}

export type AdmissionChecks = Readonly<
  Record<AdmissionCheckName, AdmissionCheck>
>;

export interface AdmissionProvenance {
  readonly authorModelId: AdmissionModelId;
  readonly criticModelId: AdmissionModelId;
  readonly adversaryModelId: AdmissionModelId;
  readonly decisiveModelId: AdmissionModelId;
}

export interface DraftAdmissionInput {
  readonly release: typeof RELEASE_ID;
  readonly draftId: string;
  readonly partition: BankPartition;
  readonly draft: CaseBundle;
  readonly provenance: AdmissionProvenance;
  readonly checks: AdmissionChecks;
}

export interface AdmissionRecord extends DraftAdmissionInput {
  readonly admitted: boolean;
  readonly reasons: readonly string[];
}

export interface ProspectiveBankInput {
  readonly release: typeof RELEASE_ID;
  readonly records: readonly unknown[];
}

export interface BankAuditCheck {
  readonly passed: boolean;
  readonly reason: string;
}

export interface BankAuditChecks {
  readonly prospectiveCount: BankAuditCheck;
  readonly recordConsistency: BankAuditCheck;
  readonly identityUniqueness: BankAuditCheck;
  readonly admittedCount: BankAuditCheck;
  readonly partitionSplit: BankAuditCheck;
  readonly factorialBalance: BankAuditCheck;
  readonly perspectivePairCoverage: BankAuditCheck;
}

export interface BankAuditReport {
  readonly release: typeof RELEASE_ID;
  readonly state: "valid" | "invalid";
  readonly records: readonly AdmissionRecord[];
  readonly admittedRecords: readonly AdmissionRecord[];
  readonly rejectedRecords: readonly AdmissionRecord[];
  readonly partitionCounts: Readonly<Record<BankPartition, number>>;
  readonly dimensionCounts: {
    readonly domains: number;
    readonly operations: number;
    readonly difficulties: number;
    readonly casesPerStratum: number | null;
  };
  readonly perspectivePairCount: number;
  readonly checks: BankAuditChecks;
  readonly reasons: readonly string[];
}

export interface ReleaseSelectionChecks {
  readonly prospectiveCount: BankAuditCheck;
  readonly recordConsistency: BankAuditCheck;
  readonly identityUniqueness: BankAuditCheck;
  readonly exactSelection: BankAuditCheck;
  readonly partitionSplit: BankAuditCheck;
  readonly factorialBalance: BankAuditCheck;
  readonly perspectivePairCoverage: BankAuditCheck;
}

export interface ReleaseSelection {
  readonly release: typeof RELEASE_ID;
  readonly state: "valid" | "invalid";
  readonly records: readonly AdmissionRecord[];
  readonly passedCandidateCount: number;
  readonly selectedRecords: readonly AdmissionRecord[];
  readonly checks: ReleaseSelectionChecks;
  readonly reasons: readonly string[];
}

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
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(record);
  if (
    actual.some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(record, key))
  ) {
    throw new TypeError(`${label} must have exactly: ${keys.join(", ")}`);
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be boolean`);
  }
  return value;
}

function requireLiteral<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new TypeError(`${label} must be ${values.join(", ")}`);
  }
  return value as T;
}

function parseProvenance(value: unknown): AdmissionProvenance {
  const record = requireRecord(value, "provenance");
  requireExactKeys(
    record,
    ["authorModelId", "criticModelId", "adversaryModelId", "decisiveModelId"],
    "provenance",
  );
  return {
    authorModelId: requireLiteral(
      record.authorModelId,
      ADMISSION_MODEL_IDS,
      "provenance.authorModelId",
    ),
    criticModelId: requireLiteral(
      record.criticModelId,
      ADMISSION_MODEL_IDS,
      "provenance.criticModelId",
    ),
    adversaryModelId: requireLiteral(
      record.adversaryModelId,
      ADMISSION_MODEL_IDS,
      "provenance.adversaryModelId",
    ),
    decisiveModelId: requireLiteral(
      record.decisiveModelId,
      ADMISSION_MODEL_IDS,
      "provenance.decisiveModelId",
    ),
  };
}

function parseChecks(value: unknown): AdmissionChecks {
  const record = requireRecord(value, "checks");
  requireExactKeys(record, ADMISSION_CHECK_NAMES, "checks");
  return Object.fromEntries(
    ADMISSION_CHECK_NAMES.map((name) => {
      const check = requireRecord(record[name], `checks.${name}`);
      requireExactKeys(check, ["passed", "reason"], `checks.${name}`);
      return [
        name,
        {
          passed: requireBoolean(check.passed, `checks.${name}.passed`),
          reason: requireString(check.reason, `checks.${name}.reason`),
        },
      ];
    }),
  ) as AdmissionChecks;
}

export function parseDraftAdmissionInput(value: unknown): DraftAdmissionInput {
  const record = requireRecord(value, "draft admission input");
  requireExactKeys(
    record,
    ["release", "draftId", "partition", "draft", "provenance", "checks"],
    "draft admission input",
  );
  return {
    release: requireLiteral(record.release, [RELEASE_ID], "release"),
    draftId: requireString(record.draftId, "draftId"),
    partition: requireLiteral(
      record.partition,
      ["development", "calibration", "release", "bridge"],
      "partition",
    ),
    draft: parseCaseBundle(record.draft),
    provenance: parseProvenance(record.provenance),
    checks: parseChecks(record.checks),
  };
}

const ADMISSION_MODEL_IDS: readonly AdmissionModelId[] = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
];

function provenanceReasons(provenance: AdmissionProvenance): string[] {
  const roleIds = [
    provenance.authorModelId,
    provenance.criticModelId,
    provenance.adversaryModelId,
  ];
  const reasons: string[] = [];
  if (
    [...roleIds, provenance.decisiveModelId].some(
      (modelId) => !ADMISSION_MODEL_IDS.includes(modelId),
    )
  ) {
    reasons.push(
      "provenance model IDs must be exactly gpt-5.6-sol, gpt-5.6-terra, or gpt-5.6-luna",
    );
  }
  if (new Set(roleIds).size !== roleIds.length) {
    reasons.push(
      "provenance author, critic, and adversary roles must be distinct",
    );
  }
  if (provenance.decisiveModelId === provenance.authorModelId) {
    reasons.push("decisive admission model must not be the author model");
  }
  if (
    provenance.decisiveModelId !== provenance.criticModelId &&
    provenance.decisiveModelId !== provenance.adversaryModelId
  ) {
    reasons.push("decisive admission model must be the critic or adversary");
  }
  return reasons;
}

export function evaluateDraft(input: DraftAdmissionInput): AdmissionRecord {
  const parsed = parseDraftAdmissionInput(input);
  const checks = parsed.checks;
  const reasons = ADMISSION_CHECK_NAMES.flatMap((name) =>
    checks[name].passed ? [] : [`${name}: ${checks[name].reason}`],
  );
  reasons.push(...provenanceReasons(parsed.provenance));
  const admitted = reasons.length === 0;
  return {
    ...parsed,
    checks,
    admitted,
    reasons,
  };
}

export function parseAdmissionRecord(value: unknown): AdmissionRecord {
  const record = requireRecord(value, "admission record");
  requireExactKeys(
    record,
    [
      "release",
      "draftId",
      "partition",
      "draft",
      "provenance",
      "checks",
      "admitted",
      "reasons",
    ],
    "admission record",
  );
  if (!Array.isArray(record.reasons)) {
    throw new TypeError("reasons must be an array");
  }
  const reasons = record.reasons.map((reason, index) =>
    requireString(reason, `reasons[${index}]`),
  );
  if (new Set(reasons).size !== reasons.length) {
    throw new TypeError("reasons must be unique");
  }
  const parsedInput = parseDraftAdmissionInput({
    release: record.release,
    draftId: record.draftId,
    partition: record.partition,
    draft: record.draft,
    provenance: record.provenance,
    checks: record.checks,
  });
  const expected = evaluateDraft(parsedInput);
  const admitted = requireBoolean(record.admitted, "admitted");
  if (
    admitted !== expected.admitted ||
    !sameStrings(reasons, expected.reasons)
  ) {
    throw new TypeError(
      "admission record outcome must match its checks and provenance",
    );
  }
  return { ...parsedInput, admitted, reasons };
}

const EXPECTED_PARTITION_COUNTS: Readonly<Record<BankPartition, number>> = {
  development: 24,
  calibration: 24,
  release: 40,
  bridge: 8,
};

function auditCheck(passed: boolean, reason: string): BankAuditCheck {
  return { passed, reason };
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function recordIsConsistent(record: AdmissionRecord): boolean {
  try {
    parseAdmissionRecord(record);
    return true;
  } catch {
    return false;
  }
}

interface ParsedProspectiveBank {
  readonly recordCount: number;
  readonly records: readonly AdmissionRecord[];
  readonly errors: readonly string[];
}

function parseProspectiveBank(value: unknown): ParsedProspectiveBank {
  try {
    const input = requireRecord(value, "prospective bank input");
    requireExactKeys(input, ["release", "records"], "prospective bank input");
    requireLiteral(input.release, [RELEASE_ID], "release");
    if (!Array.isArray(input.records)) {
      throw new TypeError("records must be an array");
    }
    const records: AdmissionRecord[] = [];
    const errors: string[] = [];
    input.records.forEach((record, index) => {
      try {
        records.push(parseAdmissionRecord(record));
      } catch (error) {
        errors.push(
          `records[${index}]: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
    return {
      recordCount: input.records.length,
      records: records.sort(compareRecords),
      errors,
    };
  } catch (error) {
    return {
      recordCount: 0,
      records: [],
      errors: [
        `input: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }
}

function countPartitions(
  records: readonly AdmissionRecord[],
): Readonly<Record<BankPartition, number>> {
  const counts: Record<BankPartition, number> = {
    development: 0,
    calibration: 0,
    release: 0,
    bridge: 0,
  };
  for (const record of records) counts[record.partition] += 1;
  return counts;
}

function uniqueCount(values: readonly string[]): number {
  return new Set(values).size;
}

export function auditProspectiveBank(
  input: ProspectiveBankInput,
): BankAuditReport {
  const parsedBank = parseProspectiveBank(input);
  const records = parsedBank.records;
  const admittedRecords = records.filter((record) => record.admitted);
  const rejectedRecords = records.filter((record) => !record.admitted);
  const partitionCounts = countPartitions(admittedRecords);
  const domains = [
    ...new Set(admittedRecords.map(({ draft }) => draft.domain)),
  ];
  const operations = [
    ...new Set(admittedRecords.map(({ draft }) => draft.operation)),
  ];
  const difficulties = [
    ...new Set(admittedRecords.map(({ draft }) => draft.difficulty)),
  ];
  const stratumCounts = new Map<string, number>();
  for (const { draft } of admittedRecords) {
    const key = `${draft.domain}\u0000${draft.operation}\u0000${draft.difficulty}`;
    stratumCounts.set(key, (stratumCounts.get(key) ?? 0) + 1);
  }
  const stratumValues = [...stratumCounts.values()];
  const casesPerStratum =
    stratumValues.length > 0 &&
    new Set(stratumValues).size === 1 &&
    stratumValues[0] !== undefined
      ? stratumValues[0]
      : null;
  const perspectivePairs = [
    ...new Set(admittedRecords.map(({ draft }) => draft.perspectives.A.pairId)),
  ];

  const duplicateDraftIds =
    uniqueCount(records.map(({ draftId }) => draftId)) !== records.length;
  const duplicateCaseIds =
    uniqueCount(records.map(({ draft }) => draft.caseId)) !== records.length;
  const duplicateFamilyIds =
    uniqueCount(records.map(({ draft }) => draft.familyId)) !== records.length;
  const duplicateSourceDigests =
    uniqueCount(records.map(({ draft }) => draft.sourceDigest)) !==
    records.length;
  const partitionPassed = Object.entries(EXPECTED_PARTITION_COUNTS).every(
    ([partition, expected]) =>
      partitionCounts[partition as BankPartition] === expected,
  );
  const factorialPassed =
    domains.length === 3 &&
    operations.length === 4 &&
    difficulties.length === 2 &&
    stratumCounts.size === 24 &&
    casesPerStratum === 4;
  const missingPairDomains = perspectivePairs.flatMap((pairId) =>
    domains.filter(
      (domain) =>
        !admittedRecords.some(
          ({ draft }) =>
            draft.domain === domain && draft.perspectives.A.pairId === pairId,
        ),
    ),
  );
  const pairCoveragePassed =
    perspectivePairs.length === 8 &&
    domains.length === 3 &&
    missingPairDomains.length === 0;
  const recordsConsistent = records.every(recordIsConsistent);

  const checks: BankAuditChecks = {
    prospectiveCount: auditCheck(
      parsedBank.recordCount === 144,
      `expected 144 prospective records; received ${parsedBank.recordCount}`,
    ),
    recordConsistency: auditCheck(
      recordsConsistent && parsedBank.errors.length === 0,
      recordsConsistent
        ? parsedBank.errors.length === 0
          ? "every admission outcome is reproducible from its explicit checks and provenance"
          : `${parsedBank.errors.length} prospective records are malformed`
        : "one or more admission outcomes are inconsistent with their explicit checks or provenance",
    ),
    identityUniqueness: auditCheck(
      !duplicateDraftIds &&
        !duplicateCaseIds &&
        !duplicateFamilyIds &&
        !duplicateSourceDigests,
      "draft IDs and all case, family, and source digest identities must be unique",
    ),
    admittedCount: auditCheck(
      admittedRecords.length === 96,
      `expected 96 admitted families; received ${admittedRecords.length}`,
    ),
    partitionSplit: auditCheck(
      partitionPassed,
      `expected development/calibration/release/bridge split 24/24/40/8; received ${partitionCounts.development}/${partitionCounts.calibration}/${partitionCounts.release}/${partitionCounts.bridge}`,
    ),
    factorialBalance: auditCheck(
      factorialPassed,
      `expected 3 domains x 4 operations x 2 difficulties x 4 cases; received ${domains.length} x ${operations.length} x ${difficulties.length} with ${casesPerStratum ?? "uneven"} cases`,
    ),
    perspectivePairCoverage: auditCheck(
      pairCoveragePassed,
      `expected exactly 8 perspective pairs spanning every admitted domain; received ${perspectivePairs.length} pairs with ${missingPairDomains.length} missing pair-domain cells`,
    ),
  };
  const reasons = Object.entries(checks).flatMap(([name, check]) =>
    check.passed ? [] : [`${name}: ${check.reason}`],
  );
  reasons.push(...parsedBank.errors);
  return {
    release: RELEASE_ID,
    state: reasons.length === 0 ? "valid" : "invalid",
    records,
    admittedRecords,
    rejectedRecords,
    partitionCounts,
    dimensionCounts: {
      domains: domains.length,
      operations: operations.length,
      difficulties: difficulties.length,
      casesPerStratum,
    },
    perspectivePairCount: perspectivePairs.length,
    checks,
    reasons,
  };
}

function compareRecords(left: AdmissionRecord, right: AdmissionRecord): number {
  return left.draftId < right.draftId
    ? -1
    : left.draftId > right.draftId
      ? 1
      : left.draft.sourceDigest < right.draft.sourceDigest
        ? -1
        : left.draft.sourceDigest > right.draft.sourceDigest
          ? 1
          : 0;
}

function chooseFour(
  records: readonly AdmissionRecord[],
): readonly (readonly AdmissionRecord[])[] {
  const choices: AdmissionRecord[][] = [];
  const selected: AdmissionRecord[] = [];
  function visit(start: number): void {
    if (selected.length === 4) {
      choices.push([...selected]);
      return;
    }
    const needed = 4 - selected.length;
    for (let index = start; index <= records.length - needed; index += 1) {
      const record = records[index];
      if (record === undefined) continue;
      selected.push(record);
      visit(index + 1);
      selected.pop();
    }
  }
  visit(0);
  return choices;
}

function findExactSelection(
  candidates: readonly AdmissionRecord[],
): readonly AdmissionRecord[] | null {
  const domains = [
    ...new Set(candidates.map(({ draft }) => draft.domain)),
  ].sort();
  const operations = [
    ...new Set(candidates.map(({ draft }) => draft.operation)),
  ].sort();
  const difficulties = [
    ...new Set(candidates.map(({ draft }) => draft.difficulty)),
  ].sort();
  const pairs = [
    ...new Set(candidates.map(({ draft }) => draft.perspectives.A.pairId)),
  ].sort();
  if (
    domains.length !== 3 ||
    operations.length !== 4 ||
    difficulties.length !== 2 ||
    pairs.length !== 8
  ) {
    return null;
  }

  const grouped = new Map<string, AdmissionRecord[]>();
  for (const candidate of candidates) {
    const { draft } = candidate;
    const key = `${draft.domain}\u0000${draft.operation}\u0000${draft.difficulty}`;
    const group = grouped.get(key) ?? [];
    group.push(candidate);
    grouped.set(key, group);
  }
  if (
    grouped.size !== 24 ||
    [...grouped.values()].some((group) => group.length < 4)
  ) {
    return null;
  }
  const strata = [...grouped.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, group]) => chooseFour([...group].sort(compareRecords)));
  const pairIndex = new Map(pairs.map((pair, index) => [pair, index]));
  const domainIndex = new Map(domains.map((domain, index) => [domain, index]));
  const completeCoverage = (1n << BigInt(pairs.length * domains.length)) - 1n;
  const remaining: Record<BankPartition, number> = {
    ...EXPECTED_PARTITION_COUNTS,
  };
  const selected: AdmissionRecord[] = [];
  const failedStates = new Set<string>();

  function visit(stratumIndex: number, coverage: bigint): boolean {
    if (stratumIndex === strata.length) {
      return (
        Object.values(remaining).every((count) => count === 0) &&
        coverage === completeCoverage
      );
    }
    const state = `${stratumIndex}|${remaining.development},${remaining.calibration},${remaining.release},${remaining.bridge}|${coverage}`;
    if (failedStates.has(state)) return false;
    const choices = strata[stratumIndex] ?? [];
    for (const choice of choices) {
      const decrements: Record<BankPartition, number> = {
        development: 0,
        calibration: 0,
        release: 0,
        bridge: 0,
      };
      let nextCoverage = coverage;
      for (const record of choice) {
        decrements[record.partition] += 1;
        const pair = pairIndex.get(record.draft.perspectives.A.pairId);
        const domain = domainIndex.get(record.draft.domain);
        if (pair !== undefined && domain !== undefined) {
          nextCoverage |= 1n << BigInt(pair * domains.length + domain);
        }
      }
      if (
        Object.keys(remaining).some(
          (partition) =>
            decrements[partition as BankPartition] >
            remaining[partition as BankPartition],
        )
      ) {
        continue;
      }
      for (const partition of Object.keys(remaining) as BankPartition[]) {
        remaining[partition] -= decrements[partition];
      }
      selected.push(...choice);
      if (visit(stratumIndex + 1, nextCoverage)) return true;
      selected.splice(selected.length - choice.length, choice.length);
      for (const partition of Object.keys(remaining) as BankPartition[]) {
        remaining[partition] += decrements[partition];
      }
    }
    failedStates.add(state);
    return false;
  }

  return visit(0, 0n) ? [...selected].sort(compareRecords) : null;
}

export function selectReleaseBank(
  input: ProspectiveBankInput,
): ReleaseSelection {
  const parsedBank = parseProspectiveBank(input);
  const records = parsedBank.records;
  const candidates = records
    .filter(({ admitted }) => admitted)
    .sort(compareRecords);
  const recordsConsistent =
    parsedBank.errors.length === 0 && records.every(recordIsConsistent);
  const identitiesUnique =
    uniqueCount(records.map(({ draftId }) => draftId)) === records.length &&
    uniqueCount(records.map(({ draft }) => draft.caseId)) === records.length &&
    uniqueCount(records.map(({ draft }) => draft.familyId)) ===
      records.length &&
    uniqueCount(records.map(({ draft }) => draft.sourceDigest)) ===
      records.length;
  const selected =
    parsedBank.recordCount === 144 &&
    candidates.length === 96 &&
    recordsConsistent &&
    identitiesUnique
      ? findExactSelection(candidates)
      : null;
  const selectedRecords = selected ?? [];
  const selectedAudit = auditProspectiveBank({
    release: RELEASE_ID,
    records: selectedRecords,
  });
  const checks: ReleaseSelectionChecks = {
    prospectiveCount: auditCheck(
      parsedBank.recordCount === 144,
      `expected 144 prospective records; received ${parsedBank.recordCount}`,
    ),
    recordConsistency: auditCheck(
      recordsConsistent,
      "every candidate outcome must be reproducible from supplied structural evidence",
    ),
    identityUniqueness: auditCheck(
      identitiesUnique,
      "draft IDs and passed candidate case/family IDs must be unique",
    ),
    exactSelection: auditCheck(
      candidates.length === 96 && selectedRecords.length === 96,
      candidates.length !== 96
        ? `expected exactly 96 passed candidates; received ${candidates.length}`
        : selected === null
          ? "no exact 96-family selection satisfies every campaign constraint"
          : "selected exactly 96 passed candidates",
    ),
    partitionSplit: selectedAudit.checks.partitionSplit,
    factorialBalance: selectedAudit.checks.factorialBalance,
    perspectivePairCoverage: selectedAudit.checks.perspectivePairCoverage,
  };
  const reasons = Object.entries(checks).flatMap(([name, check]) =>
    check.passed ? [] : [`${name}: ${check.reason}`],
  );
  reasons.push(...parsedBank.errors);
  return {
    release: RELEASE_ID,
    state: reasons.length === 0 ? "valid" : "invalid",
    records,
    passedCandidateCount: candidates.length,
    selectedRecords: reasons.length === 0 ? selectedRecords : [],
    checks,
    reasons,
  };
}

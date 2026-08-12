import {
  ADMISSION_CHECK_NAMES,
  auditProspectiveBank,
  evaluateDraft,
  parseAdmissionRecord,
  selectReleaseBank,
  type AdmissionRecord,
  type AdmissionChecks,
  type AdmissionProvenance,
  type BankPartition,
} from "./admission.ts";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";

import { validateBank } from "./bank.ts";
import {
  CONDITION_LABELS,
  RELEASE_ID,
  caseSourceDigest,
  parseCaseBundle,
  type AcceptedRegions,
  type CaseBundle,
  type CaseDecision,
  type TaskContract,
} from "./contracts.ts";
import { stableDigest, type Digest } from "./digest.ts";

export const PERSPECTIVE_PAIR_IDS = [
  "speed/assurance",
  "exploration/convergence",
  "local/systems",
  "novelty/precedent",
  "agency/guidance",
  "breadth/depth",
  "reversible/committed",
  "explicit-process/adaptive-judgment",
] as const;

export const DOMAIN_BLUEPRINT_NAMES = [
  "product",
  "research",
  "operations",
] as const;

export type PerspectivePairId = (typeof PERSPECTIVE_PAIR_IDS)[number];
export type DomainBlueprintName = (typeof DOMAIN_BLUEPRINT_NAMES)[number];

const PERSPECTIVE_PAIR_CONTRACTS: Readonly<
  Record<
    PerspectivePairId,
    {
      readonly aName: string;
      readonly bName: string;
      readonly irrelevantPairId: string;
    }
  >
> = {
  "speed/assurance": {
    aName: "speed",
    bName: "assurance",
    irrelevantPairId: "irrelevant/scanability",
  },
  "exploration/convergence": {
    aName: "exploration",
    bName: "convergence",
    irrelevantPairId: "irrelevant/date-format",
  },
  "local/systems": {
    aName: "local",
    bName: "systems",
    irrelevantPairId: "irrelevant/title-length",
  },
  "novelty/precedent": {
    aName: "novelty",
    bName: "precedent",
    irrelevantPairId: "irrelevant/list-style",
  },
  "agency/guidance": {
    aName: "agency",
    bName: "guidance",
    irrelevantPairId: "irrelevant/file-naming",
  },
  "breadth/depth": {
    aName: "breadth",
    bName: "depth",
    irrelevantPairId: "irrelevant-spacing",
  },
  "reversible/committed": {
    aName: "reversible",
    bName: "committed",
    irrelevantPairId: "irrelevant-summary-position",
  },
  "explicit-process/adaptive-judgment": {
    aName: "explicit-process",
    bName: "adaptive-judgment",
    irrelevantPairId: "irrelevant-heading-case",
  },
};

export interface PerspectiveCatalogRights {
  readonly license: "MIT";
  readonly synthetic: true;
  readonly public: true;
  readonly noUniversalPreference: true;
  readonly declaration: string;
}

export interface CatalogPerspective {
  readonly id: string;
  readonly name: string;
  readonly content: string;
}

export interface CatalogIrrelevantPerspective {
  readonly id: string;
  readonly pairId: string;
  readonly content: string;
}

export interface PerspectivePair {
  readonly pairId: PerspectivePairId;
  readonly A: CatalogPerspective;
  readonly B: CatalogPerspective;
  readonly irrelevant: CatalogIrrelevantPerspective;
  readonly neitherSideUniversallySuperior: true;
}

export interface PerspectiveCatalog {
  readonly release: typeof RELEASE_ID;
  readonly rights: PerspectiveCatalogRights;
  readonly pairs: readonly PerspectivePair[];
}

export type SemanticEvidenceMap = Readonly<Record<string, string>>;

export interface SemanticDraft {
  readonly draftId: string;
  readonly intent: "admitted" | "rejected";
  readonly partition: BankPartition;
  readonly caseId: string;
  readonly familyId: string;
  readonly operation: string;
  readonly difficulty: string;
  readonly task: TaskContract;
  readonly evidence: SemanticEvidenceMap;
  readonly perspectivePairId: PerspectivePairId;
  readonly decisions: readonly CaseDecision[];
  readonly nonGoal: string;
  readonly provenance: AdmissionProvenance;
  readonly checks: AdmissionChecks;
}

export interface DomainBlueprint {
  readonly release: typeof RELEASE_ID;
  readonly domain: DomainBlueprintName;
  readonly drafts: readonly SemanticDraft[];
}

export interface CampaignBlueprintInput {
  readonly catalog: PerspectiveCatalog;
  readonly blueprints: readonly DomainBlueprint[];
}

export interface CampaignCounts {
  readonly prospective: number;
  readonly admitted: number;
  readonly rejected: number;
  readonly development: number;
  readonly calibration: number;
  readonly release: number;
  readonly bridge: number;
}

export interface CampaignMaterialization {
  readonly release: typeof RELEASE_ID;
  readonly state: "valid" | "invalid";
  readonly written: boolean;
  readonly destination: string;
  readonly sourceBlueprintDigests: {
    readonly catalog: Digest;
    readonly product: Digest;
    readonly research: Digest;
    readonly operations: Digest;
  };
  readonly prospectiveDigest: Digest;
  readonly selectedBankDigest: Digest | null;
  readonly counts: CampaignCounts;
  readonly auditState: "valid" | "invalid";
  readonly reasons: readonly string[];
}

interface GeneratedBankEntry {
  readonly partition: BankPartition;
  readonly file: string;
  readonly caseBundle: CaseBundle;
}

const GENERATED_MARKER_FILE = ".coffee-chat-bench-generated.json";
const GENERATED_MARKER = {
  generated: true,
  generator: "materialize-bank",
  release: RELEASE_ID,
} as const;

const BANK_PARTITIONS = [
  "development",
  "calibration",
  "release",
  "bridge",
] as const satisfies readonly BankPartition[];
const SAFE_EVIDENCE_REF_PATTERN =
  /^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function compactJsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
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

function requireTrue(value: unknown, label: string): true {
  if (requireBoolean(value, label) !== true) {
    throw new TypeError(`${label} must be true`);
  }
  return true;
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty array`);
  }
  const strings = value.map((entry, index) =>
    requireString(entry, `${label}[${index}]`),
  );
  if (new Set(strings).size !== strings.length) {
    throw new TypeError(`${label} values must be unique`);
  }
  return strings;
}

function parseCatalogPerspective(
  value: unknown,
  label: string,
  expectedName: string,
): CatalogPerspective {
  const record = requireRecord(value, label);
  requireExactKeys(record, ["id", "name", "content"], label);
  const name = requireString(record.name, `${label}.name`);
  if (name !== expectedName) {
    throw new TypeError(`${label}.name must be ${expectedName}`);
  }
  return {
    id: requireString(record.id, `${label}.id`),
    name,
    content: requireString(record.content, `${label}.content`),
  };
}

function parsePerspectivePair(value: unknown, index: number): PerspectivePair {
  const label = `pairs[${index}]`;
  const record = requireRecord(value, label);
  requireExactKeys(
    record,
    ["pairId", "A", "B", "irrelevant", "neitherSideUniversallySuperior"],
    label,
  );
  const pairId = requireLiteral(
    record.pairId,
    PERSPECTIVE_PAIR_IDS,
    `${label}.pairId`,
  );
  const contract = PERSPECTIVE_PAIR_CONTRACTS[pairId];
  const irrelevantRecord = requireRecord(
    record.irrelevant,
    `${label}.irrelevant`,
  );
  requireExactKeys(
    irrelevantRecord,
    ["id", "pairId", "content"],
    `${label}.irrelevant`,
  );
  const irrelevant = {
    id: requireString(irrelevantRecord.id, `${label}.irrelevant.id`),
    pairId: requireString(
      irrelevantRecord.pairId,
      `${label}.irrelevant.pairId`,
    ),
    content: requireString(
      irrelevantRecord.content,
      `${label}.irrelevant.content`,
    ),
  };
  if (irrelevant.pairId !== contract.irrelevantPairId) {
    throw new TypeError(
      `${label}.irrelevant.pairId must be ${contract.irrelevantPairId}`,
    );
  }
  return {
    pairId,
    A: parseCatalogPerspective(record.A, `${label}.A`, contract.aName),
    B: parseCatalogPerspective(record.B, `${label}.B`, contract.bName),
    irrelevant,
    neitherSideUniversallySuperior: requireTrue(
      record.neitherSideUniversallySuperior,
      `${label}.neitherSideUniversallySuperior`,
    ),
  };
}

export function parsePerspectiveCatalog(value: unknown): PerspectiveCatalog {
  const record = requireRecord(value, "perspective catalog");
  requireExactKeys(
    record,
    ["release", "rights", "pairs"],
    "perspective catalog",
  );
  const rightsRecord = requireRecord(record.rights, "rights");
  requireExactKeys(
    rightsRecord,
    ["license", "synthetic", "public", "noUniversalPreference", "declaration"],
    "rights",
  );
  if (!Array.isArray(record.pairs) || record.pairs.length !== 8) {
    throw new TypeError(
      "perspective catalog must contain exactly 8 named pairs",
    );
  }
  const pairs = record.pairs.map(parsePerspectivePair);
  const pairIds = pairs.map(({ pairId }) => pairId);
  if (
    new Set(pairIds).size !== PERSPECTIVE_PAIR_IDS.length ||
    PERSPECTIVE_PAIR_IDS.some((pairId) => !pairIds.includes(pairId))
  ) {
    throw new TypeError(
      "perspective catalog must contain exactly the 8 named pairs",
    );
  }
  const allPerspectiveIds = pairs.flatMap(({ A, B, irrelevant }) => [
    A.id,
    B.id,
    irrelevant.id,
  ]);
  if (new Set(allPerspectiveIds).size !== allPerspectiveIds.length) {
    throw new TypeError("catalog perspective IDs must be unique");
  }
  const irrelevantPairIds = pairs.map(({ irrelevant }) => irrelevant.pairId);
  if (new Set(irrelevantPairIds).size !== irrelevantPairIds.length) {
    throw new TypeError("irrelevant pair provenance IDs must be unique");
  }
  const pairById = new Map(pairs.map((pair) => [pair.pairId, pair]));
  return {
    release: requireLiteral(record.release, [RELEASE_ID], "release"),
    rights: {
      license: requireLiteral(rightsRecord.license, ["MIT"], "rights.license"),
      synthetic: requireTrue(rightsRecord.synthetic, "rights.synthetic"),
      public: requireTrue(rightsRecord.public, "rights.public"),
      noUniversalPreference: requireTrue(
        rightsRecord.noUniversalPreference,
        "rights.noUniversalPreference",
      ),
      declaration: requireString(
        rightsRecord.declaration,
        "rights.declaration",
      ),
    },
    pairs: PERSPECTIVE_PAIR_IDS.map((pairId) => pairById.get(pairId)!),
  };
}

function parseTask(value: unknown, label: string): TaskContract {
  const record = requireRecord(value, label);
  requireExactKeys(record, ["instruction", "deliverable"], label);
  return {
    instruction: requireString(record.instruction, `${label}.instruction`),
    deliverable: requireString(record.deliverable, `${label}.deliverable`),
  };
}

function parseEvidence(value: unknown, label: string): SemanticEvidenceMap {
  const record = requireRecord(value, label);
  const entries = Object.entries(record);
  if (entries.length === 0) {
    throw new TypeError(`${label} must be a non-empty object map`);
  }
  const evidence: Record<string, string> = {};
  for (const [ref, content] of entries) {
    if (!SAFE_EVIDENCE_REF_PATTERN.test(ref)) {
      throw new TypeError(`${label} contains an unsafe evidence ref: ${ref}`);
    }
    evidence[ref] = requireString(content, `${label}.${ref}`);
  }
  return evidence;
}

function parseAcceptedRegions(value: unknown, label: string): AcceptedRegions {
  const record = requireRecord(value, label);
  requireExactKeys(record, CONDITION_LABELS, label);
  return {
    T0: requireStringArray(record.T0, `${label}.T0`),
    "T1-A": requireStringArray(record["T1-A"], `${label}.T1-A`),
    "T1-B": requireStringArray(record["T1-B"], `${label}.T1-B`),
  };
}

function parseDecisions(
  value: unknown,
  label: string,
): readonly CaseDecision[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty array`);
  }
  const decisions = value.map((entry, index) => {
    const entryLabel = `${label}[${index}]`;
    const record = requireRecord(entry, entryLabel);
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
      entryLabel,
    );
    return {
      decisionId: requireString(record.decisionId, `${entryLabel}.decisionId`),
      prompt: requireString(record.prompt, `${entryLabel}.prompt`),
      regionOptions: requireStringArray(
        record.regionOptions,
        `${entryLabel}.regionOptions`,
      ),
      partition: requireLiteral(
        record.partition,
        ["sensitive", "invariant"],
        `${entryLabel}.partition`,
      ),
      acceptedRegions: parseAcceptedRegions(
        record.acceptedRegions,
        `${entryLabel}.acceptedRegions`,
      ),
      requiredEvidenceRefs: requireStringArray(
        record.requiredEvidenceRefs,
        `${entryLabel}.requiredEvidenceRefs`,
      ),
    };
  });
  if (
    new Set(decisions.map(({ decisionId }) => decisionId)).size !==
    decisions.length
  ) {
    throw new TypeError(`${label} IDs must be unique`);
  }
  const partitions = new Set(decisions.map(({ partition }) => partition));
  if (!partitions.has("sensitive") || !partitions.has("invariant")) {
    throw new TypeError(
      `${label} must include sensitive and invariant decisions`,
    );
  }
  return decisions;
}

const ADMISSION_MODEL_IDS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
] as const;

function parseProvenance(value: unknown, label: string): AdmissionProvenance {
  const record = requireRecord(value, label);
  requireExactKeys(
    record,
    ["authorModelId", "criticModelId", "adversaryModelId", "decisiveModelId"],
    label,
  );
  return {
    authorModelId: requireLiteral(
      record.authorModelId,
      ADMISSION_MODEL_IDS,
      `${label}.authorModelId`,
    ),
    criticModelId: requireLiteral(
      record.criticModelId,
      ADMISSION_MODEL_IDS,
      `${label}.criticModelId`,
    ),
    adversaryModelId: requireLiteral(
      record.adversaryModelId,
      ADMISSION_MODEL_IDS,
      `${label}.adversaryModelId`,
    ),
    decisiveModelId: requireLiteral(
      record.decisiveModelId,
      ADMISSION_MODEL_IDS,
      `${label}.decisiveModelId`,
    ),
  };
}

function parseChecks(value: unknown, label: string): AdmissionChecks {
  const record = requireRecord(value, label);
  requireExactKeys(record, ADMISSION_CHECK_NAMES, label);
  return Object.fromEntries(
    ADMISSION_CHECK_NAMES.map((name) => {
      const checkLabel = `${label}.${name}`;
      const check = requireRecord(record[name], checkLabel);
      requireExactKeys(check, ["passed", "reason"], checkLabel);
      return [
        name,
        {
          passed: requireBoolean(check.passed, `${checkLabel}.passed`),
          reason: requireString(check.reason, `${checkLabel}.reason`),
        },
      ];
    }),
  ) as AdmissionChecks;
}

function parseSemanticDraft(value: unknown, index: number): SemanticDraft {
  const label = `drafts[${index}]`;
  const record = requireRecord(value, label);
  requireExactKeys(
    record,
    [
      "draftId",
      "intent",
      "partition",
      "caseId",
      "familyId",
      "operation",
      "difficulty",
      "task",
      "evidence",
      "perspectivePairId",
      "decisions",
      "nonGoal",
      "provenance",
      "checks",
    ],
    label,
  );
  return {
    draftId: requireString(record.draftId, `${label}.draftId`),
    intent: requireLiteral(
      record.intent,
      ["admitted", "rejected"],
      `${label}.intent`,
    ),
    partition: requireLiteral(
      record.partition,
      ["development", "calibration", "release", "bridge"],
      `${label}.partition`,
    ),
    caseId: requireString(record.caseId, `${label}.caseId`),
    familyId: requireString(record.familyId, `${label}.familyId`),
    operation: requireString(record.operation, `${label}.operation`),
    difficulty: requireString(record.difficulty, `${label}.difficulty`),
    task: parseTask(record.task, `${label}.task`),
    evidence: parseEvidence(record.evidence, `${label}.evidence`),
    perspectivePairId: requireLiteral(
      record.perspectivePairId,
      PERSPECTIVE_PAIR_IDS,
      `${label}.perspectivePairId`,
    ),
    decisions: parseDecisions(record.decisions, `${label}.decisions`),
    nonGoal: requireString(record.nonGoal, `${label}.nonGoal`),
    provenance: parseProvenance(record.provenance, `${label}.provenance`),
    checks: parseChecks(record.checks, `${label}.checks`),
  };
}

export function parseDomainBlueprint(value: unknown): DomainBlueprint {
  const record = requireRecord(value, "domain blueprint");
  requireExactKeys(record, ["release", "domain", "drafts"], "domain blueprint");
  if (!Array.isArray(record.drafts) || record.drafts.length !== 48) {
    throw new TypeError("domain blueprint must contain exactly 48 drafts");
  }
  const drafts = record.drafts.map(parseSemanticDraft);
  const admittedIntent = drafts.filter(({ intent }) => intent === "admitted");
  const rejectedIntent = drafts.filter(({ intent }) => intent === "rejected");
  if (admittedIntent.length !== 32 || rejectedIntent.length !== 16) {
    throw new TypeError(
      "domain blueprint must contain exactly 32 admitted-intent and 16 rejected-intent drafts",
    );
  }
  for (const [label, values] of [
    ["draft IDs", drafts.map(({ draftId }) => draftId)],
    ["case IDs", drafts.map(({ caseId }) => caseId)],
    ["family IDs", drafts.map(({ familyId }) => familyId)],
  ] as const) {
    if (new Set(values).size !== values.length) {
      throw new TypeError(`domain blueprint ${label} must be unique`);
    }
  }
  return {
    release: requireLiteral(record.release, [RELEASE_ID], "release"),
    domain: requireLiteral(record.domain, DOMAIN_BLUEPRINT_NAMES, "domain"),
    drafts,
  };
}

function parseCampaignInput(input: CampaignBlueprintInput): {
  readonly catalog: PerspectiveCatalog;
  readonly blueprints: readonly DomainBlueprint[];
} {
  const catalog = parsePerspectiveCatalog(input.catalog);
  if (!Array.isArray(input.blueprints) || input.blueprints.length !== 3) {
    throw new TypeError("campaign must contain exactly 3 domain blueprints");
  }
  const blueprints = input.blueprints.map(parseDomainBlueprint);
  const byDomain = new Map(
    blueprints.map((blueprint) => [blueprint.domain, blueprint]),
  );
  if (
    byDomain.size !== DOMAIN_BLUEPRINT_NAMES.length ||
    DOMAIN_BLUEPRINT_NAMES.some((domain) => !byDomain.has(domain))
  ) {
    throw new TypeError(
      "campaign must contain exactly product, research, and operations blueprints",
    );
  }
  return {
    catalog,
    blueprints: DOMAIN_BLUEPRINT_NAMES.map((domain) => byDomain.get(domain)!),
  };
}

function materializeDraft(
  blueprint: DomainBlueprint,
  semanticDraft: SemanticDraft,
  pair: PerspectivePair,
): AdmissionRecord {
  const evidence = Object.entries(semanticDraft.evidence)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([ref, content]) => ({
      ref,
      content,
      digest: stableDigest(content),
    }));
  const perspectives = {
    A: {
      id: pair.A.id,
      pairId: pair.pairId,
      content: pair.A.content,
      digest: stableDigest(pair.A.content),
    },
    B: {
      id: pair.B.id,
      pairId: pair.pairId,
      content: pair.B.content,
      digest: stableDigest(pair.B.content),
    },
    irrelevant: {
      id: pair.irrelevant.id,
      pairId: pair.irrelevant.pairId,
      content: pair.irrelevant.content,
      digest: stableDigest(pair.irrelevant.content),
    },
  };
  const semanticCase = {
    release: RELEASE_ID,
    caseId: semanticDraft.caseId,
    familyId: semanticDraft.familyId,
    domain: blueprint.domain,
    operation: semanticDraft.operation,
    difficulty: semanticDraft.difficulty,
    task: semanticDraft.task,
    evidence,
    perspectives,
    decisions: semanticDraft.decisions,
    nonGoal: semanticDraft.nonGoal,
  };
  const draft = parseCaseBundle({
    ...semanticCase,
    sourceDigest: stableDigest(semanticCase),
  });
  if (draft.sourceDigest !== caseSourceDigest(draft)) {
    throw new TypeError(
      `derived source digest failed for ${semanticDraft.draftId}`,
    );
  }
  return evaluateDraft({
    release: RELEASE_ID,
    draftId: semanticDraft.draftId,
    partition: semanticDraft.partition,
    draft,
    provenance: semanticDraft.provenance,
    checks: semanticDraft.checks,
  });
}

function campaignCounts(records: readonly AdmissionRecord[]): CampaignCounts {
  const admitted = records.filter((record) => record.admitted);
  const countPartition = (partition: BankPartition) =>
    admitted.filter((record) => record.partition === partition).length;
  return {
    prospective: records.length,
    admitted: admitted.length,
    rejected: records.length - admitted.length,
    development: countPartition("development"),
    calibration: countPartition("calibration"),
    release: countPartition("release"),
    bridge: countPartition("bridge"),
  };
}

function domainBlueprintDigest(blueprint: DomainBlueprint): Digest {
  return stableDigest({
    ...blueprint,
    drafts: [...blueprint.drafts].sort((left, right) =>
      left.draftId < right.draftId ? -1 : left.draftId > right.draftId ? 1 : 0,
    ),
  });
}

function bankEntries(
  records: readonly AdmissionRecord[],
): readonly GeneratedBankEntry[] {
  const partitionIndexes: Record<BankPartition, number> = {
    development: 0,
    calibration: 0,
    release: 0,
    bridge: 0,
  };
  return records
    .map((record) => {
      const index = partitionIndexes[record.partition];
      partitionIndexes[record.partition] += 1;
      return {
        partition: record.partition,
        file: `${index.toString().padStart(3, "0")}.json`,
        caseBundle: record.draft,
      };
    })
    .sort((left, right) => {
      const partitionOrder =
        BANK_PARTITIONS.indexOf(left.partition) -
        BANK_PARTITIONS.indexOf(right.partition);
      return partitionOrder !== 0
        ? partitionOrder
        : left.file < right.file
          ? -1
          : left.file > right.file
            ? 1
            : 0;
    });
}

function writeStagedCampaign(
  root: string,
  records: readonly AdmissionRecord[],
  entries: readonly GeneratedBankEntry[],
  campaign: unknown,
): void {
  mkdirSync(join(root, "prospective"), { recursive: true });
  for (const partition of BANK_PARTITIONS) {
    mkdirSync(join(root, partition), { recursive: true });
  }
  writeFileSync(
    join(root, GENERATED_MARKER_FILE),
    prettyJson(GENERATED_MARKER),
    "utf8",
  );
  writeFileSync(
    join(root, "prospective", "admission-ledger.jsonl"),
    records.map(compactJsonLine).join(""),
    "utf8",
  );
  for (const entry of entries) {
    writeFileSync(
      join(root, entry.partition, entry.file),
      prettyJson(entry.caseBundle),
      "utf8",
    );
  }
  writeFileSync(join(root, "campaign.json"), prettyJson(campaign), "utf8");
}

function formatGeneratedCampaign(root: string): void {
  const paths = [
    join(root, GENERATED_MARKER_FILE),
    join(root, "campaign.json"),
    ...BANK_PARTITIONS.flatMap((partition) =>
      readdirSync(join(root, partition))
        .filter((file) => file.endsWith(".json"))
        .sort()
        .map((file) => join(root, partition, file)),
    ),
  ];
  const prettier = new URL(
    "../node_modules/prettier/bin/prettier.cjs",
    import.meta.url,
  );
  const result = spawnSync(
    process.execPath,
    [prettier.pathname, "--write", "--parser", "json", ...paths],
    { encoding: "utf8" },
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new TypeError(
      `generated campaign formatting failed: ${
        result.error?.message || result.stderr.trim() || "unknown error"
      }`,
    );
  }
}

function validateStagedCampaign(
  root: string,
  prospectiveDigest: Digest,
  selectedBankDigest: Digest,
): void {
  const ledgerSource = readFileSync(
    join(root, "prospective", "admission-ledger.jsonl"),
    "utf8",
  );
  const records = ledgerSource
    .trimEnd()
    .split("\n")
    .map((line) => parseAdmissionRecord(JSON.parse(line)));
  if (stableDigest(records) !== prospectiveDigest) {
    throw new TypeError(
      "serialized prospective digest does not match campaign",
    );
  }
  const audit = auditProspectiveBank({ release: RELEASE_ID, records });
  if (audit.state !== "valid") {
    throw new TypeError(
      `serialized prospective audit failed: ${audit.reasons.join("; ")}`,
    );
  }
  const entries: GeneratedBankEntry[] = [];
  for (const partition of BANK_PARTITIONS) {
    const partitionRoot = join(root, partition);
    const report = validateBank(partitionRoot);
    if (report.state !== "valid") {
      throw new TypeError(`serialized ${partition} bank failed validation`);
    }
    for (const file of readdirSync(partitionRoot).sort()) {
      entries.push({
        partition,
        file,
        caseBundle: parseCaseBundle(
          JSON.parse(readFileSync(join(partitionRoot, file), "utf8")),
        ),
      });
    }
  }
  if (entries.length !== 96 || stableDigest(entries) !== selectedBankDigest) {
    throw new TypeError(
      "serialized selected bank digest does not match campaign",
    );
  }
}

function isGeneratedDestination(destination: string): boolean {
  if (!existsSync(destination)) return false;
  const stat = lstatSync(destination);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
  try {
    const marker = JSON.parse(
      readFileSync(join(destination, GENERATED_MARKER_FILE), "utf8"),
    ) as unknown;
    return JSON.stringify(marker) === JSON.stringify(GENERATED_MARKER);
  } catch {
    return false;
  }
}

function publishStagedCampaign(stage: string, destination: string): void {
  if (!existsSync(destination)) {
    renameSync(stage, destination);
    return;
  }
  if (!isGeneratedDestination(destination)) {
    throw new TypeError(
      "destination exists and is not a generated materialize-bank destination",
    );
  }
  const parent = dirname(destination);
  const backup = mkdtempSync(join(parent, `.${basename(destination)}.backup-`));
  rmSync(backup, { recursive: true, force: true });
  renameSync(destination, backup);
  try {
    renameSync(stage, destination);
  } catch (error) {
    renameSync(backup, destination);
    throw error;
  }
  rmSync(backup, { recursive: true, force: true });
}

function assertSafeDestinationPath(destination: string): void {
  let current = destination;
  while (true) {
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        const parent = dirname(current);
        if (parent === current) {
          throw new TypeError(
            "destination must have an existing parent directory",
          );
        }
        current = parent;
        continue;
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new TypeError(
        `destination has a symbolic link ancestor: ${current}`,
      );
    }
    if (current !== destination && !stat.isDirectory()) {
      throw new TypeError(
        `destination ancestor must be a directory: ${current}`,
      );
    }
    return;
  }
}

export function materializeCampaign(
  input: CampaignBlueprintInput,
  destination: string,
): CampaignMaterialization {
  const absoluteDestination = resolve(destination);
  assertSafeDestinationPath(absoluteDestination);
  const parsed = parseCampaignInput(input);
  const pairById = new Map(
    parsed.catalog.pairs.map((pair) => [pair.pairId, pair]),
  );
  const records = parsed.blueprints
    .flatMap((blueprint) =>
      blueprint.drafts.map((draft) =>
        materializeDraft(
          blueprint,
          draft,
          pairById.get(draft.perspectivePairId)!,
        ),
      ),
    )
    .sort((left, right) =>
      left.draftId < right.draftId ? -1 : left.draftId > right.draftId ? 1 : 0,
    );
  const audit = auditProspectiveBank({ release: RELEASE_ID, records });
  const selection = selectReleaseBank({ release: RELEASE_ID, records });
  const sourceBlueprintDigests = {
    catalog: stableDigest(parsed.catalog),
    product: domainBlueprintDigest(parsed.blueprints[0]!),
    research: domainBlueprintDigest(parsed.blueprints[1]!),
    operations: domainBlueprintDigest(parsed.blueprints[2]!),
  };
  const prospectiveDigest = stableDigest(audit.records);
  const counts = campaignCounts(audit.records);
  const reasons = [...new Set([...audit.reasons, ...selection.reasons])];
  if (audit.state !== "valid" || selection.state !== "valid") {
    return {
      release: RELEASE_ID,
      state: "invalid",
      written: false,
      destination: absoluteDestination,
      sourceBlueprintDigests,
      prospectiveDigest,
      selectedBankDigest: null,
      counts,
      auditState: "invalid",
      reasons,
    };
  }

  const entries = bankEntries(selection.selectedRecords);
  const selectedBankDigest = stableDigest(entries);
  const campaign = {
    release: RELEASE_ID,
    generated: true,
    sourceBlueprintDigests,
    prospectiveDigest,
    selectedBankDigest,
    counts,
    auditState: audit.state,
  };
  const parent = dirname(absoluteDestination);
  mkdirSync(parent, { recursive: true });
  const stage = mkdtempSync(
    join(parent, `.${basename(absoluteDestination)}.stage-`),
  );
  try {
    writeStagedCampaign(stage, audit.records, entries, campaign);
    formatGeneratedCampaign(stage);
    validateStagedCampaign(stage, prospectiveDigest, selectedBankDigest);
    publishStagedCampaign(stage, absoluteDestination);
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
  return {
    release: RELEASE_ID,
    state: "valid",
    written: true,
    destination: absoluteDestination,
    sourceBlueprintDigests,
    prospectiveDigest,
    selectedBankDigest,
    counts,
    auditState: "valid",
    reasons: [],
  };
}

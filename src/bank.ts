import { lstat, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import {
  BENCHMARK_FORMS,
  RELEASE_ID,
  TASK_ARCHETYPES,
  TASK_MODES,
  TRANSFER_TYPES,
  createCaseManifest,
  parseCaseManifest,
  stableDigest,
  type BenchmarkForm,
  type CaseManifest,
  type Digest,
  type TaskArchetype,
  type TaskMode,
  type TransferType,
} from "./contracts.ts";

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

function digest(value: unknown, label: string): Digest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} must be a sha256 digest`);
  return value as Digest;
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

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function strings(value: unknown, label: string): string[] {
  const values = array(value, label).map((entry, index) =>
    string(entry, `${label}[${index}]`),
  );
  if (new Set(values).size !== values.length)
    throw new TypeError(`${label} must not contain duplicates`);
  return values;
}

export interface BankCaseEntry {
  readonly caseId: string;
  readonly pairId: string;
  readonly form: BenchmarkForm;
  readonly domain: string;
  readonly transferType: TransferType;
  readonly taskArchetype: TaskArchetype;
  readonly taskMode: TaskMode;
  readonly casePath: string;
  readonly evaluatorPath: string;
  readonly manifestDigest: Digest;
  readonly evaluatorDigest: Digest;
}

export interface BankManifestSemantic {
  readonly release: typeof RELEASE_ID;
  readonly bankId: "public_judgment_history_bank";
  readonly status: "not_active";
  readonly license: "MIT";
  readonly samplingPlanPath: "sampling-plan.json";
  readonly samplingPlanDigest: Digest;
  readonly protocolDigest: Digest;
  readonly cases: readonly BankCaseEntry[];
}

export type BankManifest = BankManifestSemantic & {
  readonly bankDigest: Digest;
};

export interface TargetPolicy {
  readonly priorityCues: readonly [string, string, string];
  readonly tieBreaker: string;
}

export interface SharedVeto {
  readonly name: string;
  readonly condition: string;
  readonly requiredAction: string;
}

export interface CriterionSpec {
  readonly authority: "project_author_hypothesis";
  readonly humanReviewed: false;
  readonly expectedDecisionFeatures: Readonly<{
    readonly target_a: readonly string[];
    readonly target_b: readonly string[];
  }>;
  readonly expectedReasoningFeatures: readonly string[];
  readonly allowedAlternatives: readonly string[];
  readonly taskPerformanceConditions: readonly string[];
  readonly evidenceGroundingConditions: readonly string[];
  readonly criticalFailures: readonly string[];
}

export interface EvaluatorMaterialSemantic {
  readonly release: typeof RELEASE_ID;
  readonly caseId: string;
  readonly pairId: string;
  readonly policy: {
    readonly sharedVeto: SharedVeto;
    readonly target_a: TargetPolicy;
    readonly target_b: TargetPolicy;
  };
  readonly historyRoles: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  readonly criterion: CriterionSpec;
}

export type EvaluatorMaterial = EvaluatorMaterialSemantic & {
  readonly evaluatorDigest: Digest;
};

export interface ValidatedBankCase {
  readonly entry: BankCaseEntry;
  readonly manifest: CaseManifest;
  readonly evaluator: EvaluatorMaterial;
}

export interface ValidatedBank {
  readonly manifest: BankManifest;
  readonly cases: readonly ValidatedBankCase[];
}

function parseEntry(value: unknown, index: number): BankCaseEntry {
  const label = `bank.cases[${index}]`;
  const parsed = record(value, label);
  exact(
    parsed,
    [
      "caseId",
      "pairId",
      "form",
      "domain",
      "transferType",
      "taskArchetype",
      "taskMode",
      "casePath",
      "evaluatorPath",
      "manifestDigest",
      "evaluatorDigest",
    ],
    label,
  );
  return {
    caseId: string(parsed.caseId, `${label}.caseId`),
    pairId: string(parsed.pairId, `${label}.pairId`),
    form: literal(parsed.form, BENCHMARK_FORMS, `${label}.form`),
    domain: string(parsed.domain, `${label}.domain`),
    transferType: literal(
      parsed.transferType,
      TRANSFER_TYPES,
      `${label}.transferType`,
    ),
    taskArchetype: literal(
      parsed.taskArchetype,
      TASK_ARCHETYPES,
      `${label}.taskArchetype`,
    ),
    taskMode: literal(parsed.taskMode, TASK_MODES, `${label}.taskMode`),
    casePath: string(parsed.casePath, `${label}.casePath`),
    evaluatorPath: string(parsed.evaluatorPath, `${label}.evaluatorPath`),
    manifestDigest: digest(parsed.manifestDigest, `${label}.manifestDigest`),
    evaluatorDigest: digest(parsed.evaluatorDigest, `${label}.evaluatorDigest`),
  };
}

function parseSemantic(value: unknown): BankManifestSemantic {
  const parsed = record(value, "bank manifest semantic");
  exact(
    parsed,
    [
      "release",
      "bankId",
      "status",
      "license",
      "samplingPlanPath",
      "samplingPlanDigest",
      "protocolDigest",
      "cases",
    ],
    "bank manifest semantic",
  );
  const cases = array(parsed.cases, "bank.cases").map((entry, index) =>
    parseEntry(entry, index),
  );
  if (new Set(cases.map(({ caseId }) => caseId)).size !== cases.length)
    throw new TypeError("bank case IDs must be unique");
  if (
    new Set(cases.map(({ pairId }) => pairId)).size !== 8 &&
    cases.length === 32
  )
    throw new TypeError("the complete bank must contain eight target pairs");
  return {
    release: literal(parsed.release, [RELEASE_ID], "bank.release"),
    bankId: literal(
      parsed.bankId,
      ["public_judgment_history_bank"] as const,
      "bank.bankId",
    ),
    status: literal(parsed.status, ["not_active"] as const, "bank.status"),
    license: literal(parsed.license, ["MIT"] as const, "bank.license"),
    samplingPlanPath: literal(
      parsed.samplingPlanPath,
      ["sampling-plan.json"] as const,
      "bank.samplingPlanPath",
    ),
    samplingPlanDigest: digest(
      parsed.samplingPlanDigest,
      "bank.samplingPlanDigest",
    ),
    protocolDigest: digest(parsed.protocolDigest, "bank.protocolDigest"),
    cases,
  };
}

export function createBankManifest(value: BankManifestSemantic): BankManifest {
  const semantic = parseSemantic(value);
  return { ...semantic, bankDigest: stableDigest(semantic) };
}

export function parseBankManifest(value: unknown): BankManifest {
  const parsed = record(value, "bank manifest");
  exact(
    parsed,
    [
      "release",
      "bankId",
      "status",
      "license",
      "samplingPlanPath",
      "samplingPlanDigest",
      "protocolDigest",
      "cases",
      "bankDigest",
    ],
    "bank manifest",
  );
  const { bankDigest: _ignored, ...semanticValue } = parsed;
  const semantic = parseSemantic(semanticValue);
  return {
    ...semantic,
    bankDigest:
      digest(parsed.bankDigest, "bank.bankDigest") === stableDigest(semantic)
        ? (parsed.bankDigest as Digest)
        : (() => {
            throw new TypeError("bank.bankDigest does not match its content");
          })(),
  };
}

function parseTargetPolicy(value: unknown, label: string): TargetPolicy {
  const parsed = record(value, label);
  exact(parsed, ["priorityCues", "tieBreaker"], label);
  const cues = strings(parsed.priorityCues, `${label}.priorityCues`);
  if (cues.length !== 3)
    throw new TypeError(
      `${label}.priorityCues must contain exactly three cues`,
    );
  return {
    priorityCues: cues as [string, string, string],
    tieBreaker: string(parsed.tieBreaker, `${label}.tieBreaker`),
  };
}

function parseEvaluator(value: unknown): EvaluatorMaterial {
  const parsed = record(value, "evaluator material");
  exact(
    parsed,
    [
      "release",
      "caseId",
      "pairId",
      "policy",
      "historyRoles",
      "criterion",
      "evaluatorDigest",
    ],
    "evaluator material",
  );
  const policy = record(parsed.policy, "evaluator.policy");
  exact(policy, ["sharedVeto", "target_a", "target_b"], "evaluator.policy");
  const veto = record(policy.sharedVeto, "evaluator.policy.sharedVeto");
  exact(
    veto,
    ["name", "condition", "requiredAction"],
    "evaluator.policy.sharedVeto",
  );
  const criterion = record(parsed.criterion, "evaluator.criterion");
  exact(
    criterion,
    [
      "authority",
      "humanReviewed",
      "expectedDecisionFeatures",
      "expectedReasoningFeatures",
      "allowedAlternatives",
      "taskPerformanceConditions",
      "evidenceGroundingConditions",
      "criticalFailures",
    ],
    "evaluator.criterion",
  );
  const decision = record(
    criterion.expectedDecisionFeatures,
    "evaluator.criterion.expectedDecisionFeatures",
  );
  exact(
    decision,
    ["target_a", "target_b"],
    "evaluator.criterion.expectedDecisionFeatures",
  );
  const parsedCriterion: CriterionSpec = {
    authority: literal(
      criterion.authority,
      ["project_author_hypothesis"] as const,
      "evaluator.criterion.authority",
    ),
    humanReviewed:
      criterion.humanReviewed === false
        ? false
        : (() => {
            throw new TypeError(
              "evaluator.criterion.humanReviewed must be false",
            );
          })(),
    expectedDecisionFeatures: {
      target_a: strings(
        decision.target_a,
        "evaluator.criterion.expectedDecisionFeatures.target_a",
      ),
      target_b: strings(
        decision.target_b,
        "evaluator.criterion.expectedDecisionFeatures.target_b",
      ),
    },
    expectedReasoningFeatures: strings(
      criterion.expectedReasoningFeatures,
      "evaluator.criterion.expectedReasoningFeatures",
    ),
    allowedAlternatives: strings(
      criterion.allowedAlternatives,
      "evaluator.criterion.allowedAlternatives",
    ),
    taskPerformanceConditions: strings(
      criterion.taskPerformanceConditions,
      "evaluator.criterion.taskPerformanceConditions",
    ),
    evidenceGroundingConditions: strings(
      criterion.evidenceGroundingConditions,
      "evaluator.criterion.evidenceGroundingConditions",
    ),
    criticalFailures: strings(
      criterion.criticalFailures,
      "evaluator.criterion.criticalFailures",
    ),
  };
  const historyRoles = array(parsed.historyRoles, "evaluator.historyRoles").map(
    (entry, index) => string(entry, `evaluator.historyRoles[${index}]`),
  );
  if (historyRoles.length !== 8)
    throw new TypeError("evaluator.historyRoles must contain eight roles");
  const semantic: EvaluatorMaterialSemantic = {
    release: literal(parsed.release, [RELEASE_ID], "evaluator.release"),
    caseId: string(parsed.caseId, "evaluator.caseId"),
    pairId: string(parsed.pairId, "evaluator.pairId"),
    policy: {
      sharedVeto: {
        name: string(veto.name, "evaluator.policy.sharedVeto.name"),
        condition: string(
          veto.condition,
          "evaluator.policy.sharedVeto.condition",
        ),
        requiredAction: string(
          veto.requiredAction,
          "evaluator.policy.sharedVeto.requiredAction",
        ),
      },
      target_a: parseTargetPolicy(policy.target_a, "evaluator.policy.target_a"),
      target_b: parseTargetPolicy(policy.target_b, "evaluator.policy.target_b"),
    },
    historyRoles:
      historyRoles as unknown as EvaluatorMaterialSemantic["historyRoles"],
    criterion: parsedCriterion,
  };
  return {
    ...semantic,
    evaluatorDigest:
      digest(parsed.evaluatorDigest, "evaluator.evaluatorDigest") ===
      stableDigest(semantic)
        ? (parsed.evaluatorDigest as Digest)
        : (() => {
            throw new TypeError(
              "evaluator.evaluatorDigest does not match its content",
            );
          })(),
  };
}

function safePath(root: string, value: string, prefix: string): string {
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").includes("..") ||
    !value.startsWith(`${prefix}/`)
  )
    throw new TypeError(`${value} must be a relative path inside ${prefix}`);
  const absolute = resolve(root, value);
  const fromRoot = relative(root, absolute);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`))
    throw new TypeError(`${value} escapes the bank root`);
  return absolute;
}

async function readJsonFile(path: string, label: string): Promise<unknown> {
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink())
    throw new TypeError(`${label} must be a regular file`);
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new TypeError(`${label} must contain valid JSON`, { cause: error });
  }
}

export function parseEvaluatorMaterial(value: unknown): EvaluatorMaterial {
  return parseEvaluator(value);
}

export function parseValidatedBank(value: unknown): ValidatedBank {
  const parsed = record(value, "validated bank");
  exact(parsed, ["manifest", "cases"], "validated bank");
  const manifest = parseBankManifest(parsed.manifest);
  const cases = array(parsed.cases, "validated bank.cases").map(
    (value, index) => {
      const item = record(value, `validated bank.cases[${index}]`);
      exact(
        item,
        ["entry", "manifest", "evaluator"],
        `validated bank.cases[${index}]`,
      );
      const entry = parseEntry(item.entry, index);
      const declared = manifest.cases[index];
      if (!declared || JSON.stringify(entry) !== JSON.stringify(declared))
        throw new TypeError(
          `validated bank.cases[${index}].entry does not match the bank census`,
        );
      const caseManifest = parseCaseManifest(item.manifest);
      const evaluator = parseEvaluator(item.evaluator);
      if (
        caseManifest.caseId !== entry.caseId ||
        caseManifest.pairId !== entry.pairId ||
        caseManifest.form !== entry.form ||
        caseManifest.domain !== entry.domain ||
        caseManifest.transferType !== entry.transferType ||
        caseManifest.taskArchetype !== entry.taskArchetype ||
        caseManifest.taskMode !== entry.taskMode ||
        caseManifest.manifestDigest !== entry.manifestDigest ||
        evaluator.caseId !== entry.caseId ||
        evaluator.pairId !== entry.pairId ||
        evaluator.evaluatorDigest !== entry.evaluatorDigest
      )
        throw new TypeError(
          `validated bank.cases[${index}] does not bind its index entry`,
        );
      return { entry, manifest: caseManifest, evaluator };
    },
  );
  return { manifest, cases };
}

export async function validateBank(root: string): Promise<ValidatedBank> {
  const manifest = parseBankManifest(
    await readJsonFile(resolve(root, "bank.json"), "bank.json"),
  );
  const cases = [];
  for (const entry of manifest.cases) {
    cases.push({
      entry,
      manifest: await readJsonFile(
        safePath(root, entry.casePath, "public"),
        entry.casePath,
      ),
      evaluator: await readJsonFile(
        safePath(root, entry.evaluatorPath, "evaluator"),
        entry.evaluatorPath,
      ),
    });
  }
  return parseValidatedBank({ manifest, cases });
}

export { createCaseManifest };

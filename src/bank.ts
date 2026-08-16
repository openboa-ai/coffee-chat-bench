import { lstat, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import {
  BANK_SPLITS,
  BENCHMARK_CONDITIONS,
  BENCHMARK_FORMS,
  JUDGE_DIMENSIONS,
  RELEASE_ID,
  parseCaseManifest,
  stableDigest,
  type BankSplit,
  type BenchmarkCondition,
  type BenchmarkForm,
  type CaseManifest,
  type Digest,
  type JudgeDimension,
  type JudgeVerdict,
} from "./contracts.ts";

type JsonRecord = Record<string, unknown>;

export interface BankCaseEntry {
  readonly caseId: string;
  readonly familyId: string;
  readonly form: BenchmarkForm;
  readonly split: BankSplit;
  readonly casePath: string;
  readonly manifestDigest: Digest;
  readonly rubricPath: string;
  readonly rubricDigest: Digest;
  readonly judgmentPlanPath: string;
  readonly judgmentPlanDigest: Digest;
}

export interface BankManifestSemantic {
  readonly release: typeof RELEASE_ID;
  readonly bankId: string;
  readonly license: "MIT";
  readonly protocolDigest: Digest;
  readonly cases: readonly BankCaseEntry[];
}

export type BankManifest = BankManifestSemantic & {
  readonly bankDigest: Digest;
};

export interface ValidatedBankCase {
  readonly entry: BankCaseEntry;
  readonly manifest: CaseManifest;
  readonly rubric: JsonRecord;
  readonly plan: JsonRecord;
  readonly judgmentPlan: readonly JudgmentPlanSlot[];
}

export interface JudgmentPlanSlot {
  readonly judgmentId: string;
  readonly pairId: string | null;
  readonly mode: "pointwise" | "pairwise";
  readonly dimension: JudgeDimension;
  readonly orientation: "canonical" | "mirrored" | null;
  readonly conditions: readonly BenchmarkCondition[];
  readonly rubricProjection: { readonly id: string; readonly digest: Digest };
  readonly expectedVerdict: JudgmentExpectation;
}

export type JudgmentExpectation = JudgeVerdict | "left_or_tie" | "right_or_tie";

export interface ValidatedBank {
  readonly manifest: BankManifest;
  readonly cases: readonly ValidatedBankCase[];
}

function object(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function exact(value: JsonRecord, keys: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} must contain exactly ${expected.join(", ")}`);
  }
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function digest(value: unknown, label: string): Digest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new TypeError(`${label} must be a sha256 digest`);
  }
  return value as Digest;
}

function member<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !choices.includes(value)) {
    throw new TypeError(`${label} must be one of ${choices.join(", ")}`);
  }
  return value as T[number];
}

function parsePlanSlot(
  value: unknown,
  index: number,
  caseId: string,
  projections: JsonRecord,
): JudgmentPlanSlot {
  const label = `judgment plan ${index} for ${caseId}`;
  const parsed = object(value, label);
  exact(
    parsed,
    [
      "judgmentId",
      "pairId",
      "mode",
      "dimension",
      "orientation",
      "conditions",
      "rubricProjection",
      "expectedVerdict",
    ],
    label,
  );
  const mode = member(
    parsed.mode,
    ["pointwise", "pairwise"] as const,
    `${label}.mode`,
  );
  const orientation =
    parsed.orientation === null
      ? null
      : member(
          parsed.orientation,
          ["canonical", "mirrored"] as const,
          `${label}.orientation`,
        );
  const pairId =
    parsed.pairId === null ? null : text(parsed.pairId, `${label}.pairId`);
  if (
    (mode === "pointwise") !== (orientation === null) ||
    (mode === "pointwise") !== (pairId === null)
  )
    throw new TypeError(
      `${label} has incompatible mode, pair ID, or orientation`,
    );
  if (
    !Array.isArray(parsed.conditions) ||
    parsed.conditions.length !== (mode === "pointwise" ? 1 : 2)
  )
    throw new TypeError(
      `${label} must declare the exact condition cardinality for its mode`,
    );
  const conditions = parsed.conditions.map((condition, conditionIndex) =>
    member(
      condition,
      BENCHMARK_CONDITIONS,
      `${label}.conditions[${conditionIndex}]`,
    ),
  ) as BenchmarkCondition[];
  if (new Set(conditions).size !== conditions.length)
    throw new TypeError(`${label} conditions must be distinct`);
  const projection = object(
    parsed.rubricProjection,
    `${label}.rubricProjection`,
  );
  exact(projection, ["id", "digest"], `${label}.rubricProjection`);
  const id = text(projection.id, `${label}.rubricProjection.id`);
  const projectionDigest = digest(
    projection.digest,
    `${label}.rubricProjection.digest`,
  );
  if (
    !(id in projections) ||
    projectionDigest !== stableDigest(projections[id])
  )
    throw new TypeError(`${label} must bind an exact rubric projection`);
  const dimension = member(
    parsed.dimension,
    JUDGE_DIMENSIONS,
    `${label}.dimension`,
  );
  const expectedVerdict = member(
    parsed.expectedVerdict,
    mode === "pointwise"
      ? (["pass", "fail"] as const)
      : (["left", "right", "tie", "left_or_tie", "right_or_tie"] as const),
    `${label}.expectedVerdict`,
  ) as JudgmentExpectation;
  if (expectedVerdict === "left_or_tie" || expectedVerdict === "right_or_tie") {
    const expectedDiagnosticIndex = expectedVerdict === "left_or_tie" ? 0 : 1;
    const diagnosticIndexes = conditions.flatMap((condition, index) =>
      condition === "diagnostic_target_a" || condition === "diagnostic_target_b"
        ? [index]
        : [],
    );
    if (
      dimension !== "task_utility" ||
      conditions.filter((condition) => condition === "task_only").length !==
        1 ||
      diagnosticIndexes.length !== 1 ||
      diagnosticIndexes[0] !== expectedDiagnosticIndex
    ) {
      throw new TypeError(
        `${label} non-inferiority must favor one diagnostic condition over task_only`,
      );
    }
  }
  return {
    judgmentId: text(parsed.judgmentId, `${label}.judgmentId`),
    pairId,
    mode,
    dimension,
    orientation,
    conditions,
    rubricProjection: { id, digest: projectionDigest },
    expectedVerdict,
  };
}

export function parseJudgmentPlan(
  planValue: unknown,
  rubricValue: unknown,
  caseId: string,
): readonly JudgmentPlanSlot[] {
  const planFile = object(planValue, `sealed judgment plan for ${caseId}`);
  exact(
    planFile,
    ["authority", "humanReviewed", "use", "judgmentPlan"],
    `sealed judgment plan for ${caseId}`,
  );
  if (
    planFile.authority !== "project_author_hypothesis" ||
    planFile.humanReviewed !== false ||
    planFile.use !== "prospective_contrast_definition"
  )
    throw new TypeError(
      `sealed judgment plan for ${caseId} must declare its non-human authority`,
    );
  if (
    !Array.isArray(planFile.judgmentPlan) ||
    planFile.judgmentPlan.length === 0
  )
    throw new TypeError(`sealed judgment plan for ${caseId} must not be empty`);
  const rubric = object(rubricValue, `sealed rubric for ${caseId}`);
  exact(rubric, ["projections"], `sealed rubric for ${caseId}`);
  const projections = object(
    rubric.projections,
    `sealed rubric projections for ${caseId}`,
  );
  const plan = planFile.judgmentPlan.map((slot, index) =>
    parsePlanSlot(slot, index, caseId, projections),
  );
  if (new Set(plan.map(({ judgmentId }) => judgmentId)).size !== plan.length)
    throw new TypeError(`sealed judgment IDs for ${caseId} must be unique`);
  for (const [pairId, slots] of Map.groupBy(
    plan.filter((slot) => slot.pairId !== null),
    (slot) => slot.pairId!,
  )) {
    if (
      slots.length !== 2 ||
      new Set(slots.map(({ orientation }) => orientation)).size !== 2 ||
      slots.some((slot) => slot.mode !== "pairwise") ||
      slots[0]!.dimension !== slots[1]!.dimension
    )
      throw new TypeError(
        `pair ${pairId} for ${caseId} must contain canonical and mirrored slots`,
      );
    if (
      slots[0]!.rubricProjection.id !== slots[1]!.rubricProjection.id ||
      slots[0]!.rubricProjection.digest !== slots[1]!.rubricProjection.digest
    )
      throw new TypeError(
        `pair ${pairId} for ${caseId} must use one rubric projection`,
      );
    const canonical = slots.find(
      ({ orientation }) => orientation === "canonical",
    )!;
    const mirrored = slots.find(
      ({ orientation }) => orientation === "mirrored",
    )!;
    const reversedExpectation = (
      expectation: JudgmentExpectation,
    ): JudgmentExpectation =>
      expectation === "left"
        ? "right"
        : expectation === "right"
          ? "left"
          : expectation === "left_or_tie"
            ? "right_or_tie"
            : expectation === "right_or_tie"
              ? "left_or_tie"
              : expectation;
    if (
      canonical.conditions[0] !== mirrored.conditions[1] ||
      canonical.conditions[1] !== mirrored.conditions[0] ||
      mirrored.expectedVerdict !==
        reversedExpectation(canonical.expectedVerdict)
    )
      throw new TypeError(
        `pair ${pairId} for ${caseId} must reverse conditions and expected verdicts`,
      );
  }
  return plan;
}

function parseEntry(value: unknown, index: number): BankCaseEntry {
  const label = `bank.cases[${index}]`;
  const parsed = object(value, label);
  exact(
    parsed,
    [
      "caseId",
      "familyId",
      "form",
      "split",
      "casePath",
      "manifestDigest",
      "rubricPath",
      "rubricDigest",
      "judgmentPlanPath",
      "judgmentPlanDigest",
    ],
    label,
  );
  return {
    caseId: text(parsed.caseId, `${label}.caseId`),
    familyId: text(parsed.familyId, `${label}.familyId`),
    form: member(parsed.form, BENCHMARK_FORMS, `${label}.form`),
    split: member(parsed.split, BANK_SPLITS, `${label}.split`),
    casePath: text(parsed.casePath, `${label}.casePath`),
    manifestDigest: digest(parsed.manifestDigest, `${label}.manifestDigest`),
    rubricPath: text(parsed.rubricPath, `${label}.rubricPath`),
    rubricDigest: digest(parsed.rubricDigest, `${label}.rubricDigest`),
    judgmentPlanPath: text(
      parsed.judgmentPlanPath,
      `${label}.judgmentPlanPath`,
    ),
    judgmentPlanDigest: digest(
      parsed.judgmentPlanDigest,
      `${label}.judgmentPlanDigest`,
    ),
  };
}

function parseSemantic(value: unknown): BankManifestSemantic {
  const parsed = object(value, "bank");
  exact(
    parsed,
    ["release", "bankId", "license", "protocolDigest", "cases"],
    "bank",
  );
  if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) {
    throw new TypeError("bank.cases must be a non-empty array");
  }
  const cases = parsed.cases.map(parseEntry);
  for (const key of [
    "caseId",
    "familyId",
    "casePath",
    "rubricPath",
    "judgmentPlanPath",
  ] as const) {
    const values = cases.map((entry) => entry[key]);
    if (new Set(values).size !== values.length) {
      throw new TypeError(`bank.cases must have unique ${key} values`);
    }
  }
  return {
    release: member(parsed.release, [RELEASE_ID] as const, "bank.release"),
    bankId: text(parsed.bankId, "bank.bankId"),
    license: member(parsed.license, ["MIT"] as const, "bank.license"),
    protocolDigest: digest(parsed.protocolDigest, "bank.protocolDigest"),
    cases,
  };
}

export function createBankManifest(value: BankManifestSemantic): BankManifest {
  const semantic = parseSemantic(value);
  return { ...semantic, bankDigest: stableDigest(semantic) };
}

export function parseBankManifest(value: unknown): BankManifest {
  const parsed = object(value, "bank manifest");
  if (!("bankDigest" in parsed)) {
    throw new TypeError("bank manifest.bankDigest is required");
  }
  const { bankDigest: claimedDigest, ...semanticValue } = parsed;
  const semantic = parseSemantic(semanticValue);
  const actualDigest = digest(claimedDigest, "bank manifest.bankDigest");
  if (actualDigest !== stableDigest(semantic)) {
    throw new TypeError("bank manifest.bankDigest does not match its content");
  }
  return { ...semantic, bankDigest: actualDigest };
}

function safePath(root: string, value: string, prefix: string): string {
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").includes("..") ||
    !value.startsWith(`${prefix}/`)
  ) {
    throw new TypeError(`${value} must be a relative path inside ${prefix}`);
  }
  const absolute = resolve(root, value);
  const fromRoot = relative(root, absolute);
  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`)) {
    throw new TypeError(`${value} escapes the bank root`);
  }
  return absolute;
}

async function readJsonFile(path: string, label: string): Promise<unknown> {
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new TypeError(`${label} must be a regular file`);
  }
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new TypeError(`${label} must contain valid JSON`, { cause: error });
  }
}

function assertSplitDisjointness(cases: readonly ValidatedBankCase[]) {
  const qualificationBlocks = new Set(
    cases
      .filter(({ manifest }) => manifest.split === "judge_qualification")
      .map(({ manifest }) => manifest.targetPairBlockId),
  );
  if (
    cases.some(
      ({ manifest }) =>
        manifest.split !== "judge_qualification" &&
        qualificationBlocks.has(manifest.targetPairBlockId),
    )
  )
    throw new TypeError(
      "qualification target blocks must be disjoint from release blocks",
    );
  const lineage = new Map<
    string,
    { readonly split: BankSplit; readonly caseId: string }
  >();
  for (const { manifest } of cases)
    for (const token of [
      ...manifest.lineage.sourceIds.map((id) => `source:${id}`),
      `template:${manifest.lineage.templateId}`,
      `rubric-template:${manifest.lineage.rubricTemplateId}`,
    ]) {
      const prior = lineage.get(token);
      if (prior !== undefined && prior.split !== manifest.split)
        throw new TypeError(
          `lineage overlap across splits for ${token} (${prior.caseId}, ${manifest.caseId})`,
        );
      lineage.set(token, { split: manifest.split, caseId: manifest.caseId });
    }
}

/** Validates the sealed, already-loaded bank used by report derivation. */
export function parseValidatedBank(value: unknown): ValidatedBank {
  const parsed = object(value, "validated bank");
  exact(parsed, ["manifest", "cases"], "validated bank");
  const manifest = parseBankManifest(parsed.manifest);
  if (
    !Array.isArray(parsed.cases) ||
    parsed.cases.length !== manifest.cases.length
  )
    throw new TypeError("validated bank cases must match the bank census");
  const cases = parsed.cases.map((value, index) => {
    const label = `validated bank.cases[${index}]`;
    const candidate = object(value, label);
    exact(candidate, ["entry", "manifest", "rubric", "plan"], label);
    const entry = parseEntry(candidate.entry, index);
    const declared = manifest.cases[index]!;
    if (JSON.stringify(entry) !== JSON.stringify(declared))
      throw new TypeError(`${label}.entry must match the exact bank census`);
    const caseManifest = parseCaseManifest(candidate.manifest);
    const rubric = object(candidate.rubric, `${label}.rubric`);
    const plan = object(candidate.plan, `${label}.plan`);
    if (
      caseManifest.caseId !== entry.caseId ||
      caseManifest.familyId !== entry.familyId ||
      caseManifest.form !== entry.form ||
      caseManifest.split !== entry.split ||
      caseManifest.manifestDigest !== entry.manifestDigest ||
      stableDigest(rubric) !== entry.rubricDigest ||
      entry.rubricDigest !== caseManifest.sealed.rubricDigest ||
      stableDigest(plan) !== entry.judgmentPlanDigest ||
      entry.judgmentPlanDigest !== caseManifest.sealed.judgmentPlanDigest
    )
      throw new TypeError(`${label} does not bind its sealed bank entry`);
    return {
      entry,
      manifest: caseManifest,
      rubric,
      plan,
      judgmentPlan: parseJudgmentPlan(plan, rubric, caseManifest.caseId),
    };
  });
  assertSplitDisjointness(cases);
  return { manifest, cases };
}

export async function validateBank(root: string): Promise<ValidatedBank> {
  const manifest = parseBankManifest(
    await readJsonFile(resolve(root, "bank.json"), "bank.json"),
  );
  const cases: unknown[] = [];

  for (const entry of manifest.cases) {
    const manifestValue = await readJsonFile(
      safePath(root, entry.casePath, "cases"),
      entry.casePath,
    );
    cases.push({
      entry,
      manifest: manifestValue,
      rubric: await readJsonFile(
        safePath(root, entry.rubricPath, "evaluator/rubrics"),
        entry.rubricPath,
      ),
      plan: await readJsonFile(
        safePath(root, entry.judgmentPlanPath, "evaluator/plans"),
        entry.judgmentPlanPath,
      ),
    });
  }

  return parseValidatedBank({ manifest, cases });
}

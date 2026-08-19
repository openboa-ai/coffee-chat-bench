import { lstat, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { RELEASE_ID, stableDigest } from "./contracts.ts";
import { validateBank, type ValidatedBank } from "./bank.ts";

const EXPECTED_DOMAINS = [
  "product_service_operations",
  "scientific_technical_investigation",
  "organizational_design",
  "public_resource_allocation",
  "security_reliability",
  "editorial_creative_strategy",
  "education_coaching",
  "procurement_portfolio_allocation",
] as const;

const EXPECTED_CENSUS = {
  pairs: 8,
  targets: 16,
  historyRecordsPerTarget: 8,
  caseFamilies: 32,
  conditions: 3,
  agentExecutions: 96,
} as const;

const LEGACY_MARKERS = [
  "release_a",
  "release_b",
  "judge_qualification",
  "task_only",
  "diagnostic_target",
  "nondiagnostic_target",
  "templateId",
  "evaluatorPath",
  "evaluatorDigest",
] as const;

type SamplingPlan = {
  readonly release: string;
  readonly bankId: string;
  readonly census: Record<string, number>;
  readonly strata: Record<string, unknown>;
  readonly pairs: readonly {
    readonly pairId: string;
    readonly cases: readonly {
      readonly caseId: string;
      readonly domain: string;
      readonly transferType: string;
      readonly form: string;
      readonly taskMode: string;
      readonly taskArchetype: string;
      readonly documentCount: number;
      readonly workspaceNoise: string;
    }[];
  }[];
};

export interface DataAuditReport {
  readonly status: "passed" | "failed";
  readonly bankDigest: string;
  readonly checks: Readonly<Record<string, boolean>>;
  readonly census: Readonly<Record<string, number>>;
  readonly errors: readonly string[];
  readonly warnings?: readonly string[];
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function count(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((result, value) => {
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}

function check(
  condition: boolean,
  label: string,
  errors: string[],
  checks: Record<string, boolean>,
) {
  checks[label] = condition;
  if (!condition) errors.push(label);
}

function planShape(value: unknown): SamplingPlan {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("sampling plan must be an object");
  return value as SamplingPlan;
}

function tokenCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function historyReferences(value: string): string[] {
  return [...value.matchAll(/\[history-[^\]]+\]/gu)].map((match) => match[0]);
}

function forbiddenAnnotationKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(forbiddenAnnotationKey);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      /expected|score|hidden|critical.?failure|golden|judge/iu.test(key) ||
      forbiddenAnnotationKey(nested),
  );
}

async function directoryNames(path: string): Promise<string[]> {
  try {
    return (await readdir(path)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function auditAnnotations(
  root: string,
  bank: ValidatedBank,
  errors: string[],
  checks: Record<string, boolean>,
) {
  const pairFiles = await directoryNames(resolve(root, "annotations/pairs"));
  const caseFiles = await directoryNames(resolve(root, "annotations/cases"));
  check(pairFiles.length === 8, "annotations.pair-count", errors, checks);
  check(caseFiles.length === 32, "annotations.case-count", errors, checks);
  const expectedPairs = new Set(
    bank.cases.map(({ entry }) => `${entry.pairId}.json`),
  );
  const expectedCases = new Set(
    bank.cases.map(({ entry }) => `${entry.caseId}.json`),
  );
  check(
    pairFiles.every((name) => expectedPairs.has(name)),
    "annotations.pair-index",
    errors,
    checks,
  );
  check(
    caseFiles.every((name) => expectedCases.has(name)),
    "annotations.case-index",
    errors,
    checks,
  );
  const values = await Promise.all(
    [
      ...pairFiles.map((name) => resolve(root, "annotations/pairs", name)),
      ...caseFiles.map((name) => resolve(root, "annotations/cases", name)),
    ].map(readJson),
  );
  check(
    values.every((value) => !forbiddenAnnotationKey(value)),
    "annotations.no-reference-labels",
    errors,
    checks,
  );
  check(
    values.every(
      (value) =>
        value !== null &&
        typeof value === "object" &&
        (value as Record<string, unknown>).reviewStatus ===
          "pending_human_audit",
    ),
    "annotations.review-state",
    errors,
    checks,
  );
}

function auditCases(
  bank: ValidatedBank,
  errors: string[],
  checks: Record<string, boolean>,
) {
  const cases = bank.cases;
  const domainCounts = count(cases.map(({ manifest }) => manifest.domain));
  const transferCounts = count(
    cases.map(({ manifest }) => manifest.transferType),
  );
  const formCounts = count(cases.map(({ manifest }) => manifest.form));
  const modeCounts = count(cases.map(({ manifest }) => manifest.taskMode));
  const archetypeCounts = count(
    cases.map(({ manifest }) => manifest.taskArchetype),
  );
  check(cases.length === 32, "census.caseFamilies", errors, checks);
  check(
    new Set(cases.map(({ entry }) => entry.pairId)).size === 8,
    "census.targetPairs",
    errors,
    checks,
  );
  check(
    EXPECTED_DOMAINS.every((domain) => domainCounts[domain] === 4) &&
      Object.values(domainCounts).every((value) => value === 4),
    "balance.domain",
    errors,
    checks,
  );
  check(
    Object.values(transferCounts).every((value) => value === 8),
    "balance.transfer",
    errors,
    checks,
  );
  check(
    formCounts.dialogue === 16 && formCounts.professional_artifact === 16,
    "balance.form",
    errors,
    checks,
  );
  check(
    modeCounts.bounded === 16 && modeCounts.open_ended === 16,
    "balance.taskMode",
    errors,
    checks,
  );
  check(
    archetypeCounts.recommendation === 8 &&
      archetypeCounts.allocation_prioritization === 8 &&
      archetypeCounts.design_threshold === 8 &&
      archetypeCounts.critique_revision === 8,
    "balance.taskArchetype",
    errors,
    checks,
  );
  for (const { entry, manifest } of cases) {
    const a = manifest.contexts.target_a;
    const b = manifest.contexts.target_b;
    const documents = manifest.documents;
    const documentSources = documents.map(({ source }) => source);
    check(
      manifest.caseId === entry.caseId &&
        manifest.pairId === entry.pairId &&
        manifest.form === entry.form &&
        manifest.domain === entry.domain &&
        manifest.transferType === entry.transferType &&
        manifest.taskArchetype === entry.taskArchetype &&
        manifest.taskMode === entry.taskMode,
      `binding.public-entry.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      manifest.contexts.unconditioned.length === 0 &&
        a.length === 8 &&
        b.length === 8,
      `history.cardinality.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      JSON.stringify(a.map(({ id, format }) => ({ id, format }))) ===
        JSON.stringify(b.map(({ id, format }) => ({ id, format }))),
      `history.shape-parity.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      a.every(
        (record, index) =>
          JSON.stringify(historyReferences(record.content)) ===
          JSON.stringify(historyReferences(b[index]?.content ?? "")),
      ),
      `history.reference-parity.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      Object.values(count(a.map(({ format }) => format))).every(
        (value) => value === 2,
      ),
      `history.format-balance.${entry.caseId}`,
      errors,
      checks,
    );
    const aLength = a.reduce((total, item) => total + item.content.length, 0);
    const bLength = b.reduce((total, item) => total + item.content.length, 0);
    const aTokens = a.reduce(
      (total, item) => total + tokenCount(item.content),
      0,
    );
    const bTokens = b.reduce(
      (total, item) => total + tokenCount(item.content),
      0,
    );
    check(
      Math.abs(aLength - bLength) / Math.max(aLength, bLength) <= 0.1,
      `history.length-parity.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      Math.abs(aTokens - bTokens) / Math.max(aTokens, bTokens) <= 0.1,
      `history.token-parity.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      a.filter(({ content }) => content.includes("Reasoning:")).length <= 4 &&
        b.filter(({ content }) => content.includes("Reasoning:")).length <= 4,
      `history.rationale-limit.${entry.caseId}`,
      errors,
      checks,
    );
    const differingRecords = a.filter(
      (record, index) => record.content !== b[index]?.content,
    ).length;
    check(
      differingRecords >= 4 && differingRecords <= 6,
      `history.diagnostic-difference.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      a.filter((record, index) => record.content === b[index]?.content)
        .length >= 2,
      `history.constraint-convergence.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      documents.length >= 4 &&
        documents.length <= 12 &&
        new Set(documents.map(({ documentId }) => documentId)).size ===
          documents.length &&
        new Set(documentSources).size === documents.length &&
        documents.every(
          ({ source, license }) =>
            source.startsWith("synthetic://") && license === "MIT",
        ),
      `documents.integrity.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      manifest.task.output.requiredReferenceIds.every((id) =>
        documents.some((document) => document.documentId === id),
      ) &&
        manifest.lineage.sourceIds.length === documents.length &&
        manifest.lineage.sourceIds.every((source) =>
          documentSources.includes(source),
        ),
      `documents.references.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      manifest.task.deliverables.length >= 3 &&
        manifest.task.hardConstraints.length >= 3 &&
        manifest.task.output.requiredReferenceIds.every((id) =>
          manifest.task.hardConstraints.some((constraint) =>
            constraint.includes(`[${id}]`),
          ),
        ),
      `task.contract.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      !JSON.stringify(manifest).match(
        new RegExp(LEGACY_MARKERS.join("|"), "u"),
      ),
      `public.no-legacy-fields.${entry.caseId}`,
      errors,
      checks,
    );
  }
}

export async function auditBank(root: string): Promise<DataAuditReport> {
  const bank = await validateBank(root);
  const plan = planShape(await readJson(resolve(root, "sampling-plan.json")));
  const errors: string[] = [];
  const checks: Record<string, boolean> = {};
  const warnings: string[] = [];
  check(
    plan.release === RELEASE_ID &&
      plan.bankId === "public_judgment_history_bank",
    "sampling.identity",
    errors,
    checks,
  );
  check(
    JSON.stringify(plan.census) === JSON.stringify(EXPECTED_CENSUS),
    "sampling.census",
    errors,
    checks,
  );
  check(
    stableDigest(plan) === bank.manifest.samplingPlanDigest,
    "binding.sampling-plan-digest",
    errors,
    checks,
  );
  check(plan.pairs.length === 8, "sampling.pairs", errors, checks);
  check(
    plan.pairs.every((pair) => {
      const transfer = count(
        pair.cases.map(({ transferType }) => transferType),
      );
      const forms = count(pair.cases.map(({ form }) => form));
      const modes = count(pair.cases.map(({ taskMode }) => taskMode));
      const archetypes = count(
        pair.cases.map(({ taskArchetype }) => taskArchetype),
      );
      return (
        pair.cases.length === 4 &&
        Object.values(transfer).every((value) => value === 1) &&
        forms.dialogue === 2 &&
        forms.professional_artifact === 2 &&
        modes.bounded === 2 &&
        modes.open_ended === 2 &&
        Object.values(archetypes).every((value) => value === 1) &&
        pair.cases.every(({ caseId }) => caseId.startsWith(`${pair.pairId}-`))
      );
    }),
    "sampling.pair-cell-coverage",
    errors,
    checks,
  );
  check(
    JSON.stringify(
      bank.manifest.cases.map(
        ({
          caseId,
          pairId,
          form,
          domain,
          transferType,
          taskArchetype,
          taskMode,
        }) => ({
          caseId,
          pairId,
          form,
          domain,
          transferType,
          taskArchetype,
          taskMode,
        }),
      ),
    ) ===
      JSON.stringify(
        plan.pairs.flatMap(({ pairId, cases }) =>
          cases.map(
            ({
              caseId,
              domain,
              transferType,
              form,
              taskMode,
              taskArchetype,
            }) => ({
              caseId,
              pairId,
              form,
              domain,
              transferType,
              taskArchetype,
              taskMode,
            }),
          ),
        ),
      ),
    "binding.sampling-index",
    errors,
    checks,
  );
  check(
    bank.manifest.cases.every(({ casePath }) =>
      casePath.startsWith("public/cases/"),
    ),
    "boundary.public-paths-only",
    errors,
    checks,
  );
  try {
    await lstat(resolve(root, "evaluator"));
    check(false, "boundary.no-evaluator-directory", errors, checks);
  } catch (error) {
    check(
      (error as NodeJS.ErrnoException).code === "ENOENT",
      "boundary.no-evaluator-directory",
      errors,
      checks,
    );
  }
  check(
    !JSON.stringify(bank).match(new RegExp(LEGACY_MARKERS.join("|"), "u")),
    "boundary.no-legacy-identifiers",
    errors,
    checks,
  );
  auditCases(bank, errors, checks);
  await auditAnnotations(root, bank, errors, checks);
  const census = {
    pairs: new Set(bank.cases.map(({ entry }) => entry.pairId)).size,
    targets: 16,
    historyRecordsPerTarget: 8,
    caseFamilies: bank.cases.length,
    conditions: 3,
    agentExecutions: bank.cases.length * 3,
  };
  const documentCount = bank.cases.reduce(
    (total, { manifest }) => total + manifest.documents.length,
    0,
  );
  if (documentCount < 160 || documentCount > 288)
    warnings.push(
      `document count is ${documentCount}; inspect the generated bundles`,
    );
  return {
    status: errors.length === 0 ? "passed" : "failed",
    bankDigest: bank.manifest.bankDigest,
    checks,
    census,
    errors,
    warnings,
  };
}

import { readFile } from "node:fs/promises";
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

const LEGACY_MARKERS = [
  "release_a",
  "release_b",
  "judge_qualification",
  "task_only",
  "diagnostic_target",
  "nondiagnostic_target",
] as const;

type SamplingPlan = {
  readonly release: string;
  readonly bankId: string;
  readonly pairs: readonly {
    readonly pairId: string;
    readonly domain: string;
    readonly cases: readonly {
      readonly caseId: string;
      readonly transferType: string;
      readonly form: string;
      readonly taskMode: string;
      readonly taskArchetype: string;
    }[];
  }[];
  readonly census: Record<string, number>;
};

export interface DataAuditReport {
  readonly status: "passed" | "failed";
  readonly bankDigest: string;
  readonly checks: Readonly<Record<string, boolean>>;
  readonly census: Readonly<Record<string, number>>;
  readonly errors: readonly string[];
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function asPlan(value: unknown): SamplingPlan {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("sampling plan must be an object");
  return value as SamplingPlan;
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

function referenceIds(content: string): string[] {
  return [...content.matchAll(/\[(history-[^\]]+)\]/gu)].map(
    (match) => match[1]!,
  );
}

function auditCases(
  bank: ValidatedBank,
  errors: string[],
  checks: Record<string, boolean>,
) {
  const cases = bank.cases;
  check(cases.length === 32, "census.caseFamilies", errors, checks);
  check(
    new Set(cases.map(({ entry }) => entry.pairId)).size === 8,
    "census.targetPairs",
    errors,
    checks,
  );
  check(
    cases.every(
      ({ manifest, evaluator }) =>
        manifest.contexts.unconditioned.length === 0 &&
        manifest.contexts.target_a.length === 8 &&
        manifest.contexts.target_b.length === 8,
    ),
    "history.cardinality",
    errors,
    checks,
  );
  const domainCounts = count(cases.map(({ manifest }) => manifest.domain));
  check(
    EXPECTED_DOMAINS.every((domain) => domainCounts[domain] === 4),
    "balance.domain",
    errors,
    checks,
  );
  check(
    Object.values(domainCounts).every((value) => value === 4),
    "balance.domain.no-extra",
    errors,
    checks,
  );
  check(
    Object.values(
      count(cases.map(({ manifest }) => manifest.transferType)),
    ).every((value) => value === 8),
    "balance.transfer",
    errors,
    checks,
  );
  check(
    Object.values(count(cases.map(({ manifest }) => manifest.form))).every(
      (value) => value === 16,
    ),
    "balance.form",
    errors,
    checks,
  );
  check(
    Object.values(count(cases.map(({ manifest }) => manifest.taskMode))).every(
      (value) => value === 16,
    ),
    "balance.taskMode",
    errors,
    checks,
  );
  check(
    Object.values(
      count(cases.map(({ manifest }) => manifest.taskArchetype)),
    ).every((value) => value === 8),
    "balance.taskArchetype",
    errors,
    checks,
  );
  for (const { entry, manifest, evaluator } of cases) {
    const a = manifest.contexts.target_a;
    const b = manifest.contexts.target_b;
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
      evaluator.caseId === entry.caseId && evaluator.pairId === entry.pairId,
      `binding.evaluator-entry.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      JSON.stringify(a.map(({ id, format }) => ({ id, format }))) ===
        JSON.stringify(b.map(({ id, format }) => ({ id, format }))),
      `pair.history-shape.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      Object.values(count(a.map(({ format }) => format))).every(
        (value) => value === 2,
      ),
      `pair.history-format-balance.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      a.every(
        (record, index) =>
          JSON.stringify(referenceIds(record.content).sort()) ===
          JSON.stringify(referenceIds(b[index]!.content).sort()),
      ),
      `pair.history-evidence-parity.${entry.caseId}`,
      errors,
      checks,
    );
    const aLength = a.reduce((n, item) => n + item.content.length, 0);
    const bLength = b.reduce((n, item) => n + item.content.length, 0);
    check(
      Math.abs(aLength - bLength) / Math.max(aLength, bLength) <= 0.1,
      `pair.history-parity.${entry.caseId}`,
      errors,
      checks,
    );
    const tokenCount = (records: readonly { readonly content: string }[]) =>
      records.reduce(
        (total, item) => total + item.content.trim().split(/\s+/u).length,
        0,
      );
    const aTokens = tokenCount(a);
    const bTokens = tokenCount(b);
    check(
      Math.abs(aTokens - bTokens) / Math.max(aTokens, bTokens) <= 0.1,
      `pair.history-token-parity.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      a.filter(({ content }) => content.includes("Reasoning:")).length <= 4 &&
        b.filter(({ content }) => content.includes("Reasoning:")).length <= 4,
      `pair.partial-rationale-limit.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      evaluator.historyRoles.length === 8 &&
        evaluator.historyRoles.filter((role) => role === "diagnostic")
          .length === 5 &&
        evaluator.historyRoles.filter((role) => role === "boundary").length ===
          2 &&
        evaluator.historyRoles.filter((role) => role === "distractor")
          .length === 1,
      `pair.history-roles.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      a.every(({ content }) => content === content.trim()) &&
        b.every(({ content }) => content === content.trim()),
      `pair.history-whitespace.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      a
        .slice(0, 5)
        .every((record, index) => record.content !== b[index]!.content),
      `pair.diagnostic-discrimination.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      a
        .slice(5, 7)
        .every((record, index) => record.content === b[index + 5]!.content),
      `pair.boundary-convergence.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      a[7]!.content === b[7]!.content,
      `pair.distractor-convergence.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      evaluator.criterion.authority === "project_author_hypothesis" &&
        evaluator.criterion.humanReviewed === false,
      `criterion.provisional.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      manifest.evidence.every(
        ({ source, license }) =>
          source.startsWith(
            "synthetic://openboa-ai/coffee-chat-bench/evidence/",
          ) && license === "MIT",
      ),
      `provenance.synthetic.${entry.caseId}`,
      errors,
      checks,
    );
    const publicText = JSON.stringify(manifest).toLowerCase();
    const policyCues = [
      ...evaluator.policy.target_a.priorityCues,
      ...evaluator.policy.target_b.priorityCues,
    ].map((cue) => cue.toLowerCase());
    const publicRationales = [...a, ...b]
      .map(({ content }) => content.match(/Reasoning:[^\n]*/gu) ?? [])
      .flat()
      .join("\n")
      .toLowerCase();
    check(
      !publicText.match(
        /criterion|diagnostic_target|nondiagnostic_target|judge_qualification|release_[ab]/iu,
      ) &&
        policyCues.every(
          (cue) =>
            (!cue.includes("_") || !publicText.includes(cue)) &&
            !publicRationales.includes(cue),
        ),
      `public.no-evaluator-leak.${entry.caseId}`,
      errors,
      checks,
    );
    check(
      evaluator.policy.target_a.priorityCues.length === 3 &&
        evaluator.policy.target_b.priorityCues.length === 3,
      `policy.cue-cardinality.${entry.caseId}`,
      errors,
      checks,
    );
  }
}

export async function auditBank(root: string): Promise<DataAuditReport> {
  const bank = await validateBank(root);
  const plan = asPlan(await readJson(resolve(root, "sampling-plan.json")));
  const errors: string[] = [];
  const checks: Record<string, boolean> = {};
  const evidenceSources = bank.cases.flatMap(({ manifest }) =>
    manifest.evidence.map(({ source }) => source),
  );
  const planSemantic = {
    release: plan.release,
    bankId: plan.bankId,
    pairs: plan.pairs,
    census: plan.census,
  };
  check(
    plan.release === RELEASE_ID &&
      plan.bankId === "public_judgment_history_bank",
    "sampling.identity",
    errors,
    checks,
  );
  check(
    JSON.stringify(plan.census) ===
      JSON.stringify({
        pairs: 8,
        targets: 16,
        historyRecordsPerTarget: 8,
        caseFamilies: 32,
        conditions: 3,
        agentExecutions: 96,
      }),
    "sampling.census",
    errors,
    checks,
  );
  check(
    stableDigest(planSemantic) === bank.manifest.samplingPlanDigest,
    "binding.sampling-plan-digest",
    errors,
    checks,
  );
  check(
    new Set(evidenceSources).size === evidenceSources.length,
    "lineage.unique-evidence-sources",
    errors,
    checks,
  );
  check(plan.pairs.length === 8, "sampling.pairs", errors, checks);
  check(
    plan.pairs.every((pair) => pair.cases.length === 4),
    "sampling.cases-per-pair",
    errors,
    checks,
  );
  check(
    new Set(plan.pairs.map((pair) => pair.pairId)).size === 8,
    "sampling.unique-pairs",
    errors,
    checks,
  );
  check(
    plan.pairs.every(
      (pair) =>
        new Set(pair.cases.map(({ transferType }) => transferType)).size ===
          4 &&
        Object.values(count(pair.cases.map(({ form }) => form))).every(
          (value) => value === 2,
        ) &&
        Object.values(count(pair.cases.map(({ taskMode }) => taskMode))).every(
          (value) => value === 2,
        ),
    ),
    "sampling.pair-cell-coverage",
    errors,
    checks,
  );
  check(
    plan.pairs.every((pair) =>
      pair.cases.every(({ caseId }) => caseId.startsWith(`${pair.pairId}-`)),
    ),
    "sampling.case-lineage",
    errors,
    checks,
  );
  check(
    bank.manifest.cases.length === 32,
    "binding.bank-census",
    errors,
    checks,
  );
  check(
    bank.manifest.cases.every(
      ({ casePath, evaluatorPath }) =>
        casePath.startsWith("public/") &&
        evaluatorPath.startsWith("evaluator/"),
    ),
    "boundary.paths",
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
        plan.pairs.flatMap(({ pairId, domain, cases }) =>
          cases.map(
            ({ caseId, transferType, form, taskMode, taskArchetype }) => ({
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
    !JSON.stringify(bank).match(new RegExp(LEGACY_MARKERS.join("|"), "u")),
    "boundary.no-legacy-identifiers",
    errors,
    checks,
  );
  auditCases(bank, errors, checks);
  const census = {
    pairs: new Set(bank.cases.map(({ entry }) => entry.pairId)).size,
    targets: 16,
    historyRecordsPerTarget: 8,
    caseFamilies: bank.cases.length,
    conditions: 3,
    agentExecutions: bank.cases.length * 3,
  };
  return {
    status: errors.length === 0 ? "passed" : "failed",
    bankDigest: bank.manifest.bankDigest,
    checks,
    census,
    errors,
  };
}

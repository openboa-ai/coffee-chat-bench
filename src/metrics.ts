import { renderCase } from "./artifact.ts";
import {
  parseValidatedBank,
  type JudgmentPlanSlot,
  type ValidatedBank,
} from "./bank.ts";
import {
  BENCHMARK_CONDITIONS,
  BENCHMARK_FORMS,
  JUDGE_DIMENSIONS,
  parseCandidateIdentity,
  parseJudgmentRecord,
  parseRunReceipt,
  stableDigest,
  type BankSplit,
  type BenchmarkCondition,
  type BenchmarkReport,
  type BenchmarkReportSemantic,
  type CandidateIdentity,
  type Digest,
  type FormReport,
  type JudgeDimension,
  type JudgmentRecord,
  type Rate,
  type RunReceipt,
} from "./contracts.ts";
import { parseJudgeConfiguration, type JudgeConfiguration } from "./judge.ts";

const REPORT_KEYS = [
  "benchCommit",
  "candidate",
  "bank",
  "judgeConfiguration",
  "receipts",
  "judgments",
] as const;
type EligibleReceipt = Extract<RunReceipt, { readonly state: "succeeded" }>;
type BoundJudgment = JudgmentRecord & { readonly slot: JudgmentPlanSlot };
type FamilyState = "qualified" | "failed" | "unavailable";

export interface DeriveBenchmarkReportInput {
  readonly benchCommit: string;
  readonly candidate: CandidateIdentity;
  readonly bank: ValidatedBank;
  readonly judgeConfiguration: JudgeConfiguration;
  readonly receipts: readonly RunReceipt[];
  readonly judgments: readonly JudgmentRecord[];
}

function exactObject(value: unknown, keys: readonly string[], label: string) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...keys].sort())
  )
    throw new TypeError(`${label} must contain exactly ${keys.join(", ")}`);
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function rate(numerator: number, denominator: number): Rate {
  return denominator === 0
    ? { state: "unmeasured", numerator: 0, denominator: 0, value: null }
    : {
        state: "measured",
        numerator,
        denominator,
        value: numerator / denominator,
      };
}

function parseInput(value: unknown): DeriveBenchmarkReportInput {
  const parsed = exactObject(value, REPORT_KEYS, "report input");
  if (
    typeof parsed.benchCommit !== "string" ||
    !/^[0-9a-f]{40}$/u.test(parsed.benchCommit)
  )
    throw new TypeError(
      "report input.benchCommit must be a full Git commit SHA",
    );
  return {
    benchCommit: parsed.benchCommit,
    candidate: parseCandidateIdentity(parsed.candidate),
    bank: parseValidatedBank(parsed.bank),
    judgeConfiguration: parseJudgeConfiguration(parsed.judgeConfiguration),
    receipts: array(parsed.receipts, "report input.receipts").map(
      parseRunReceipt,
    ),
    judgments: array(parsed.judgments, "report input.judgments").map(
      parseJudgmentRecord,
    ),
  };
}

function receiptKey(caseId: string, condition: BenchmarkCondition) {
  return `${caseId}\u0000${condition}`;
}

function isEligible(
  receipt: RunReceipt | undefined,
): receipt is EligibleReceipt {
  return (
    receipt?.state === "succeeded" &&
    receipt.execution?.cleanup === "succeeded" &&
    receipt.session.leakage === "passed"
  );
}

function bindReceipts(input: DeriveBenchmarkReportInput) {
  const manifests = new Map(
    input.bank.cases.map(({ manifest }) => [manifest.caseId, manifest]),
  );
  const byCaseCondition = new Map<string, RunReceipt>();
  const byDigest = new Map<Digest, RunReceipt>();
  for (const receipt of input.receipts) {
    const manifest = manifests.get(receipt.caseId);
    if (!manifest || receipt.manifestDigest !== manifest.manifestDigest)
      throw new TypeError("report receipt must bind the exact bank census");
    if (
      receipt.benchCommit !== input.benchCommit ||
      receipt.bankDigest !== input.bank.manifest.bankDigest ||
      receipt.candidate.candidateDigest !== input.candidate.candidateDigest
    )
      throw new TypeError(
        "report receipt does not bind the report candidate, bench, and bank",
      );
    if (
      receipt.taskDigest !==
      renderCase(manifest, {
        trialId: receipt.trialId,
        condition: receipt.condition,
      }).taskDigest
    )
      throw new TypeError(
        "report receipt task digest does not match its declared case, condition, and trial",
      );
    const key = receiptKey(receipt.caseId, receipt.condition);
    if (byCaseCondition.has(key) || byDigest.has(receipt.receiptDigest))
      throw new TypeError(
        "report receipts must contain one receipt per bank case and condition",
      );
    byCaseCondition.set(key, receipt);
    byDigest.set(receipt.receiptDigest, receipt);
  }
  return { byCaseCondition, byDigest };
}

function same<T>(left: readonly T[], right: readonly T[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function bindJudgments(
  input: DeriveBenchmarkReportInput,
  receipts: ReadonlyMap<Digest, RunReceipt>,
) {
  const cases = new Map(
    input.bank.cases.map((entry) => [entry.manifest.caseId, entry]),
  );
  const configurationDigest = stableDigest(input.judgeConfiguration);
  const seenRecords = new Set<Digest>();
  const seenSlots = new Set<string>();
  const bound: BoundJudgment[] = [];
  for (const judgment of input.judgments) {
    const bankCase = cases.get(judgment.caseId);
    if (!bankCase || seenRecords.has(judgment.recordDigest))
      throw new TypeError(
        "report judgments must be unique and bind the exact bank census",
      );
    seenRecords.add(judgment.recordDigest);
    const slot = bankCase.judgmentPlan.find(
      ({ judgmentId }) => judgmentId === judgment.judgmentId,
    );
    if (
      !slot ||
      seenSlots.has(`${judgment.caseId}\u0000${judgment.judgmentId}`)
    )
      throw new TypeError(
        "report judgments must bind one unique declared judgment-plan slot",
      );
    seenSlots.add(`${judgment.caseId}\u0000${judgment.judgmentId}`);
    if (
      judgment.rubricDigest !== bankCase.manifest.sealed.rubricDigest ||
      judgment.rubricProjectionId !== slot.rubricProjection.id ||
      judgment.rubricProjectionDigest !== slot.rubricProjection.digest ||
      judgment.judgeConfigurationDigest !== configurationDigest ||
      !same(judgment.primaryJudges, input.judgeConfiguration.primaryJudges) ||
      !same(
        judgment.crossValidationJudges,
        input.judgeConfiguration.crossValidationJudges,
      ) ||
      judgment.mode !== slot.mode ||
      judgment.dimension !== slot.dimension ||
      judgment.orientation !== slot.orientation
    )
      throw new TypeError(
        "report judgment must bind its sealed slot, rubric projection, and frozen configuration",
      );
    const conditions: BenchmarkCondition[] = [];
    for (const [index, receiptDigest] of judgment.runReceiptDigests.entries()) {
      const receipt = receipts.get(receiptDigest);
      if (!isEligible(receipt))
        throw new TypeError(
          "report judgment cannot score a run without succeeded isolation cleanup",
        );
      if (
        judgment.caseId !== receipt.caseId ||
        judgment.trialIds[index] !== receipt.trialId ||
        judgment.artifactDigests[index] !== receipt.artifact.digest ||
        judgment.artifactValidationDigests[index] !==
          receipt.artifact.validationDigest
      )
        throw new TypeError(
          "report judgment does not exactly bind its receipt, artifact, and validation evidence",
        );
      conditions.push(receipt.condition);
    }
    if (!same(conditions, slot.conditions))
      throw new TypeError(
        "report judgment conditions must match its exact declared slot ordering",
      );
    bound.push({ ...judgment, slot });
  }
  return bound;
}

type PlanOutcome = {
  readonly dimension: JudgeDimension;
  readonly state: "pass" | "fail" | null;
};

function winner(record: BoundJudgment) {
  if (record.outcome.state !== "measured") return null;
  if (
    record.mode === "pairwise" &&
    record.artifactDigests[0] === record.artifactDigests[1]
  )
    return "tie";
  return record.outcome.verdict === "tie"
    ? "tie"
    : record.artifactDigests[record.outcome.verdict === "left" ? 0 : 1]!;
}

function matchesExpectedWinner(
  slot: JudgmentPlanSlot,
  record: BoundJudgment,
  actual: string,
) {
  if (slot.expectedVerdict === "tie") return actual === "tie";
  if (slot.expectedVerdict === "left_or_tie")
    return actual === "tie" || actual === record.artifactDigests[0];
  if (slot.expectedVerdict === "right_or_tie")
    return actual === "tie" || actual === record.artifactDigests[1];
  return (
    actual === record.artifactDigests[slot.expectedVerdict === "left" ? 0 : 1]
  );
}

function planOutcomes(
  bankCase: ValidatedBank["cases"][number],
  records: ReadonlyMap<string, BoundJudgment>,
): readonly PlanOutcome[] {
  const key = (judgmentId: string) =>
    `${bankCase.manifest.caseId}\u0000${judgmentId}`;
  const pointwise = bankCase.judgmentPlan
    .filter(({ pairId }) => pairId === null)
    .map((slot) => {
      const record = records.get(key(slot.judgmentId));
      return {
        dimension: slot.dimension,
        state:
          record?.outcome.state === "measured"
            ? record.outcome.verdict === slot.expectedVerdict
              ? "pass"
              : "fail"
            : null,
      } as PlanOutcome;
    });
  const pairs = Map.groupBy(
    bankCase.judgmentPlan.filter(({ pairId }) => pairId !== null),
    ({ pairId }) => pairId!,
  );
  return [
    ...pointwise,
    ...[...pairs.values()].map((slots) => {
      const canonicalSlot = slots.find(
        ({ orientation }) => orientation === "canonical",
      )!;
      const mirroredSlot = slots.find(
        ({ orientation }) => orientation === "mirrored",
      )!;
      const canonical = records.get(key(canonicalSlot.judgmentId));
      const mirrored = records.get(key(mirroredSlot.judgmentId));
      const canonicalWinner = canonical ? winner(canonical) : null;
      const mirroredWinner = mirrored ? winner(mirrored) : null;
      if (
        !canonical ||
        !mirrored ||
        canonicalWinner === null ||
        mirroredWinner === null
      )
        return { dimension: canonicalSlot.dimension, state: null };
      if (canonicalWinner !== mirroredWinner)
        return { dimension: canonicalSlot.dimension, state: null };
      return {
        dimension: canonicalSlot.dimension,
        state: matchesExpectedWinner(canonicalSlot, canonical, canonicalWinner)
          ? "pass"
          : "fail",
      } as PlanOutcome;
    }),
  ];
}

function familyState(
  bankCase: ValidatedBank["cases"][number],
  receipts: ReadonlyMap<string, RunReceipt>,
  records: ReadonlyMap<string, BoundJudgment>,
): FamilyState {
  const runs = BENCHMARK_CONDITIONS.map((condition) =>
    receipts.get(receiptKey(bankCase.manifest.caseId, condition)),
  );
  if (
    runs.some((run) => !isEligible(run)) ||
    new Set(runs.map((run) => run?.session.sessionDigest)).size !==
      runs.length ||
    !same(
      [...runs.map((run) => run!.session.order)].sort(
        (left, right) => left - right,
      ),
      [...BENCHMARK_CONDITIONS.keys()],
    )
  )
    return "unavailable";
  const outcomes = planOutcomes(bankCase, records);
  if (
    !JUDGE_DIMENSIONS.every((dimension) =>
      outcomes.some(
        (outcome) => outcome.dimension === dimension && outcome.state !== null,
      ),
    )
  )
    return "unavailable";
  const results = outcomes.map(({ state }) => state);
  if (results.some((result) => result === null)) return "unavailable";
  return results.every((result) => result === "pass") ? "qualified" : "failed";
}

function metricRate(
  outcomes: readonly PlanOutcome[],
  dimension: JudgeDimension,
): Rate {
  const measured = outcomes.filter(
    (outcome) => outcome.dimension === dimension && outcome.state !== null,
  );
  return rate(
    measured.filter(({ state }) => state === "pass").length,
    measured.length,
  );
}

function cleanup(receipt: RunReceipt | undefined) {
  return receipt?.state === "succeeded"
    ? (receipt.execution?.cleanup ?? "unavailable")
    : "not_applicable";
}

function count(values: readonly string[]) {
  return Object.fromEntries(
    values.reduce(
      (counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1),
      new Map<string, number>(),
    ),
  );
}

function formReport(
  split: Extract<BankSplit, "release_a" | "release_b">,
  form: FormReport["form"],
  cases: readonly ValidatedBank["cases"][number][],
  allReceipts: readonly RunReceipt[],
  records: readonly BoundJudgment[],
  byCaseCondition: ReadonlyMap<string, RunReceipt>,
): FormReport {
  const recordMap = new Map(
    records.map((record) => [
      `${record.caseId}\u0000${record.judgmentId}`,
      record,
    ]),
  );
  const states = new Map(
    cases.map((bankCase) => [
      bankCase.manifest.caseId,
      familyState(bankCase, byCaseCondition, recordMap),
    ]),
  );
  const receipts = allReceipts.filter((receipt) => states.has(receipt.caseId));
  const eligible = receipts.filter(isEligible);
  const usage = eligible.filter((receipt) => receipt.usage !== null);
  const qualified = [...states.values()].filter(
    (state) => state === "qualified",
  ).length;
  const measured = [...states.values()].filter(
    (state) => state !== "unavailable",
  ).length;
  const judgments = records.filter((record) => states.has(record.caseId));
  const outcomes = cases.flatMap((bankCase) =>
    planOutcomes(bankCase, recordMap),
  );
  const critical = judgments.filter(
    (record) =>
      record.dimension === "critical_failure" &&
      record.mode === "pointwise" &&
      record.outcome.state === "measured",
  );
  return {
    split,
    form,
    census: {
      families: cases.length,
      measured,
      receipts: count([
        ...receipts.map((receipt) => receipt.state),
        ...cases.flatMap(({ manifest }) =>
          BENCHMARK_CONDITIONS.filter(
            (condition) =>
              !byCaseCondition.has(receiptKey(manifest.caseId, condition)),
          ).map(() => "missing"),
        ),
      ]),
      cleanup: count(
        receipts.map(cleanup).filter((state) => state !== "not_applicable"),
      ),
      judgments: count([
        ...judgments.map(({ outcome }) => outcome.state),
        ...cases
          .flatMap(({ manifest, judgmentPlan }) =>
            judgmentPlan.filter(
              ({ judgmentId }) =>
                !recordMap.has(`${manifest.caseId}\u0000${judgmentId}`),
            ),
          )
          .map(() => "missing"),
      ]),
      family: count([...states.values()]),
    },
    targetAlignment: metricRate(outcomes, "target_alignment"),
    taskUtility: metricRate(outcomes, "task_utility"),
    evidenceIntegrity: metricRate(outcomes, "evidence_integrity"),
    targetSpecificity: metricRate(outcomes, "target_specificity"),
    criticalFailureRate: rate(
      critical.filter(
        (record) =>
          record.outcome.state === "measured" &&
          record.outcome.verdict === "fail",
      ).length,
      critical.length,
    ),
    qpcfr: rate(qualified, measured),
    efficiency:
      eligible.length === 0
        ? {
            state: "unmeasured",
            samples: 0,
            durationMsMean: null,
            inputTokensMean: null,
            outputTokensMean: null,
            costNanoUsdTotal: null,
          }
        : {
            state: "measured",
            samples: eligible.length,
            durationMsMean:
              eligible.reduce(
                (total, receipt) => total + receipt.durationMs,
                0,
              ) / eligible.length,
            inputTokensMean:
              usage.length === 0
                ? null
                : usage.reduce(
                    (total, receipt) => total + receipt.usage!.inputTokens,
                    0,
                  ) / usage.length,
            outputTokensMean:
              usage.length === 0
                ? null
                : usage.reduce(
                    (total, receipt) => total + receipt.usage!.outputTokens,
                    0,
                  ) / usage.length,
            costNanoUsdTotal:
              usage.length === 0
                ? null
                : usage.reduce(
                    (total, receipt) => total + receipt.usage!.costNanoUsd,
                    0,
                  ),
          },
    caseCensus: cases.map(({ manifest, judgmentPlan }) => ({
      caseId: manifest.caseId,
      familyId: manifest.familyId,
      manifestDigest: manifest.manifestDigest,
      familyState: states.get(manifest.caseId)!,
      trials: BENCHMARK_CONDITIONS.map((condition) => {
        const receipt = byCaseCondition.get(
          receiptKey(manifest.caseId, condition),
        );
        return {
          condition,
          trialId: receipt?.trialId ?? null,
          receiptDigest: receipt?.receiptDigest ?? null,
          receiptState: receipt?.state ?? "missing",
          artifactValidationDigest:
            receipt?.state === "succeeded"
              ? receipt.artifact.validationDigest
              : null,
          session: receipt?.session ?? null,
          cleanup: cleanup(receipt),
          judgmentRecordDigests: judgmentPlan
            .filter((slot) => slot.conditions.includes(condition))
            .map(
              (slot) =>
                recordMap.get(`${manifest.caseId}\u0000${slot.judgmentId}`)
                  ?.recordDigest,
            )
            .filter((digest): digest is Digest => digest !== undefined),
        };
      }),
    })),
    coverage: {
      observedReceipts: receipts.length,
      semanticEligibleReceipts: eligible.length,
      judgedRecords: judgments.length,
      numericFamilies: measured,
    },
    uncertainty: {
      unmeasuredFamilies: cases.length - measured,
      qpcfrLowerBound: qualified / cases.length,
      qpcfrUpperBound: (qualified + cases.length - measured) / cases.length,
    },
  };
}

export function deriveBenchmarkReport(value: unknown): BenchmarkReport {
  const input = parseInput(value);
  const { byCaseCondition, byDigest } = bindReceipts(input);
  const judgments = bindJudgments(input, byDigest);
  const forms = (["release_a", "release_b"] as const).flatMap((split) =>
    BENCHMARK_FORMS.flatMap((form) => {
      const cases = input.bank.cases.filter(
        ({ manifest }) => manifest.split === split && manifest.form === form,
      );
      return cases.length === 0
        ? []
        : [
            formReport(
              split,
              form,
              cases,
              input.receipts,
              judgments,
              byCaseCondition,
            ),
          ];
    }),
  );
  const semantic: BenchmarkReportSemantic = {
    release: "2026.8.12",
    benchCommit: input.benchCommit,
    bankDigest: input.bank.manifest.bankDigest,
    candidate: input.candidate,
    provenance: {
      bankId: input.bank.manifest.bankId,
      protocolDigest: input.bank.manifest.protocolDigest,
      judgeConfigurationDigest: stableDigest(input.judgeConfiguration),
    },
    forms,
  };
  return { ...semantic, reportDigest: stableDigest(semantic) };
}

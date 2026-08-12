import type {
  CaseBundle,
  ConditionLabel,
  DecisionManifest,
  EfficiencySample,
  QualificationDimensions,
  ResultState,
  TrialVerdict,
} from "./contracts.ts";
import { CONDITION_LABELS, RELEASE_ID, RESULT_STATES } from "./contracts.ts";

export type StateCounts = Partial<Record<ResultState, number>>;

export interface TrialQualificationInput {
  readonly state: ResultState;
  readonly trialId: string;
  readonly condition: ConditionLabel;
  readonly caseBundle: CaseBundle;
  readonly manifest?: DecisionManifest;
  readonly assessment?: {
    readonly dimensions: QualificationDimensions;
    readonly evidenceRefs: readonly string[];
  };
  readonly evidenceRefs?: readonly string[];
  readonly efficiency?: EfficiencySample;
}

export interface FamilyQualificationInput {
  readonly caseBundle: CaseBundle;
  readonly trials: readonly TrialVerdict[];
}

export interface FamilyVerdict {
  readonly release: "2026.8.12";
  readonly familyId: string;
  readonly domain: string;
  readonly operation: string;
  readonly state: ResultState;
  readonly qualified: boolean | null;
  readonly conditionLabels: readonly ConditionLabel[];
  readonly sensitiveContrast: boolean | null;
  readonly invariantsPreserved: boolean | null;
  readonly criticalFailure: boolean | null;
  readonly trialStateCounts: StateCounts;
  readonly efficiency: readonly EfficiencySample[];
}

export interface AggregateInput {
  readonly release: "2026.8.12";
  readonly families: readonly FamilyVerdict[];
  readonly bootstrapSamples: readonly (readonly string[])[];
}

export interface StratumRate {
  readonly key: string;
  readonly state: "measured" | "unmeasured";
  readonly numerator: number;
  readonly denominator: number;
  readonly value: number | null;
}

export interface MacroRate {
  readonly state: "measured" | "unmeasured";
  readonly value: number | null;
  readonly strataMeasured: number;
  readonly strataTotal: number;
}

export interface QpcfrReport {
  readonly byDomain: readonly StratumRate[];
  readonly byOperation: readonly StratumRate[];
  readonly macroByDomain: MacroRate;
  readonly macroByOperation: MacroRate;
}

export interface BootstrapInterval {
  readonly lower: number;
  readonly upper: number;
}

export interface BootstrapReport {
  readonly unit: "case_family";
  readonly samples: number;
  readonly macroByDomain: BootstrapInterval | null;
  readonly macroByOperation: BootstrapInterval | null;
}

export interface SummaryStatistic {
  readonly mean: number;
  readonly median: number;
}

export type EfficiencyReport =
  | {
      readonly state: "measured";
      readonly sampleCount: number;
      readonly wallTimeMs: SummaryStatistic;
      readonly inputTokens: SummaryStatistic;
      readonly outputTokens: SummaryStatistic;
    }
  | {
      readonly state: "unmeasured";
      readonly sampleCount: 0;
      readonly wallTimeMs: null;
      readonly inputTokens: null;
      readonly outputTokens: null;
    };

export interface BenchmarkReport {
  readonly release: "2026.8.12";
  readonly familyStateCounts: StateCounts;
  readonly trialStateCounts: StateCounts;
  readonly qpcfr: QpcfrReport;
  readonly bootstrap: BootstrapReport;
  readonly efficiency: EfficiencyReport;
}

function requireRelease(release: string): void {
  if (release !== RELEASE_ID) {
    throw new TypeError(`release must be ${RELEASE_ID}`);
  }
}

function emptyTrialVerdict(input: TrialQualificationInput): TrialVerdict {
  const evidenceRefs = input.evidenceRefs ?? [];
  return {
    release: RELEASE_ID,
    trialId: input.trialId,
    caseId: input.caseBundle.caseId,
    familyId: input.caseBundle.familyId,
    domain: input.caseBundle.domain,
    operation: input.caseBundle.operation,
    condition: input.condition,
    state: input.state,
    qualified: null,
    dimensions: null,
    criticalFailure: null,
    decisions: [],
    evidenceRefs,
    efficiency: input.efficiency ?? null,
  };
}

function assertDeclaredEvidence(
  refs: readonly string[],
  caseBundle: CaseBundle,
  label: string,
): void {
  const declared = new Set(caseBundle.evidence.map((entry) => entry.ref));
  for (const ref of refs) {
    if (!declared.has(ref)) {
      throw new TypeError(`${label} references undeclared evidence ${ref}`);
    }
  }
}

export function qualifyTrial(input: TrialQualificationInput): TrialVerdict {
  requireRelease(input.caseBundle.release);
  if (input.state !== "measured") return emptyTrialVerdict(input);
  if (input.manifest === undefined || input.assessment === undefined) {
    throw new TypeError("measured trial requires a manifest and assessment");
  }

  const { caseBundle, manifest, assessment } = input;
  requireRelease(manifest.release);
  if (manifest.trialId !== input.trialId) {
    throw new TypeError("manifest trialId must match the trial");
  }
  if (manifest.caseId !== caseBundle.caseId) {
    throw new TypeError("manifest caseId must match the case bundle");
  }
  if (manifest.condition !== input.condition) {
    throw new TypeError("manifest condition must match the trial condition");
  }

  assertDeclaredEvidence(assessment.evidenceRefs, caseBundle, "assessment");
  const manifestById = new Map(
    manifest.decisions.map((decision) => [decision.decisionId, decision]),
  );
  if (
    manifestById.size !== caseBundle.decisions.length ||
    manifest.decisions.length !== caseBundle.decisions.length
  ) {
    throw new TypeError("manifest must cover each case decision exactly once");
  }

  const decisions = caseBundle.decisions.map((expected) => {
    const actual = manifestById.get(expected.decisionId);
    if (actual === undefined) {
      throw new TypeError(
        `manifest is missing decision ${expected.decisionId}`,
      );
    }
    assertDeclaredEvidence(
      actual.evidenceRefs,
      caseBundle,
      `decision ${actual.decisionId}`,
    );
    const evidenceComplete = expected.requiredEvidenceRefs.every(
      (ref) =>
        actual.evidenceRefs.includes(ref) &&
        assessment.evidenceRefs.includes(ref),
    );
    return {
      ...actual,
      partition: expected.partition,
      accepted: expected.acceptedRegions[input.condition].includes(
        actual.selectedRegion,
      ),
      evidenceComplete,
    };
  });

  const deterministicPass = decisions.every(
    (decision) => decision.accepted && decision.evidenceComplete,
  );
  const dimensionsPass =
    assessment.dimensions.taskAdequate &&
    assessment.dimensions.evidenceIntegrity &&
    assessment.dimensions.perspectiveAligned &&
    assessment.dimensions.invariantsPreserved &&
    !assessment.dimensions.criticalFailure;

  return {
    release: RELEASE_ID,
    trialId: input.trialId,
    caseId: caseBundle.caseId,
    familyId: caseBundle.familyId,
    domain: caseBundle.domain,
    operation: caseBundle.operation,
    condition: input.condition,
    state: "measured",
    qualified: deterministicPass && dimensionsPass,
    dimensions: assessment.dimensions,
    criticalFailure: assessment.dimensions.criticalFailure,
    decisions,
    evidenceRefs: assessment.evidenceRefs,
    efficiency: input.efficiency ?? null,
  };
}

function countStates(states: readonly ResultState[]): StateCounts {
  const counts: StateCounts = {};
  for (const state of states) counts[state] = (counts[state] ?? 0) + 1;
  return counts;
}

function familyNonMeasuredState(trials: readonly TrialVerdict[]): ResultState {
  for (const state of RESULT_STATES) {
    if (state !== "measured" && trials.some((trial) => trial.state === state)) {
      return state;
    }
  }
  return "unmeasured";
}

function selection(
  trial: TrialVerdict,
  decisionId: string,
): string | undefined {
  return trial.decisions.find((decision) => decision.decisionId === decisionId)
    ?.selectedRegion;
}

export function qualifyFamily(input: FamilyQualificationInput): FamilyVerdict {
  requireRelease(input.caseBundle.release);
  for (const trial of input.trials) {
    if (trial.familyId !== input.caseBundle.familyId) {
      throw new TypeError("all trials must belong to the case family");
    }
  }

  const conditionLabels = CONDITION_LABELS.filter((condition) =>
    input.trials.some((trial) => trial.condition === condition),
  );
  const trialStateCounts = countStates(
    input.trials.map((trial) => trial.state),
  );
  const efficiency = input.trials.flatMap((trial) =>
    trial.efficiency === null ? [] : [trial.efficiency],
  );
  const a = input.trials.filter((trial) => trial.condition === "T1-A");
  const b = input.trials.filter((trial) => trial.condition === "T1-B");
  const completePair =
    a.length === 1 &&
    b.length === 1 &&
    input.trials.every((trial) => trial.state === "measured");

  if (!completePair) {
    return {
      release: RELEASE_ID,
      familyId: input.caseBundle.familyId,
      domain: input.caseBundle.domain,
      operation: input.caseBundle.operation,
      state: familyNonMeasuredState(input.trials),
      qualified: null,
      conditionLabels,
      sensitiveContrast: null,
      invariantsPreserved: null,
      criticalFailure: null,
      trialStateCounts,
      efficiency,
    };
  }

  const trialA = a[0];
  const trialB = b[0];
  if (trialA === undefined || trialB === undefined) {
    throw new Error("complete A/B pair invariant violated");
  }
  const sensitive = input.caseBundle.decisions.filter(
    (decision) => decision.partition === "sensitive",
  );
  const invariants = input.caseBundle.decisions.filter(
    (decision) => decision.partition === "invariant",
  );
  const sensitiveContrast = sensitive.every(
    (decision) =>
      selection(trialA, decision.decisionId) !==
      selection(trialB, decision.decisionId),
  );
  const invariantsPreserved = invariants.every(
    (decision) =>
      selection(trialA, decision.decisionId) ===
      selection(trialB, decision.decisionId),
  );
  const criticalFailure = input.trials.some(
    (trial) => trial.criticalFailure === true,
  );
  const qualified =
    input.trials.every((trial) => trial.qualified === true) &&
    sensitiveContrast &&
    invariantsPreserved &&
    !criticalFailure;

  return {
    release: RELEASE_ID,
    familyId: input.caseBundle.familyId,
    domain: input.caseBundle.domain,
    operation: input.caseBundle.operation,
    state: "measured",
    qualified,
    conditionLabels,
    sensitiveContrast,
    invariantsPreserved,
    criticalFailure,
    trialStateCounts,
    efficiency,
  };
}

function stratumRates(
  families: readonly FamilyVerdict[],
  selectKey: (family: FamilyVerdict) => string,
): readonly StratumRate[] {
  const keys = [...new Set(families.map(selectKey))].sort();
  return keys.map((key) => {
    const measured = families.filter(
      (family) => family.state === "measured" && selectKey(family) === key,
    );
    const numerator = measured.filter(
      (family) => family.qualified === true,
    ).length;
    const denominator = measured.length;
    return {
      key,
      state: denominator === 0 ? "unmeasured" : "measured",
      numerator,
      denominator,
      value: denominator === 0 ? null : numerator / denominator,
    };
  });
}

function macroRate(strata: readonly StratumRate[]): MacroRate {
  const measured = strata.filter(
    (stratum): stratum is StratumRate & { readonly value: number } =>
      stratum.value !== null,
  );
  return {
    state: measured.length === 0 ? "unmeasured" : "measured",
    value:
      measured.length === 0
        ? null
        : measured.reduce((sum, stratum) => sum + stratum.value, 0) /
          measured.length,
    strataMeasured: measured.length,
    strataTotal: strata.length,
  };
}

function qpcfr(families: readonly FamilyVerdict[]): QpcfrReport {
  const byDomain = stratumRates(families, (family) => family.domain);
  const byOperation = stratumRates(families, (family) => family.operation);
  return {
    byDomain,
    byOperation,
    macroByDomain: macroRate(byDomain),
    macroByOperation: macroRate(byOperation),
  };
}

function quantile(values: readonly number[], probability: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined || upper === undefined) {
    throw new TypeError("cannot compute a quantile for an empty sample");
  }
  return lower + (upper - lower) * (position - lowerIndex);
}

function interval(values: readonly number[]): BootstrapInterval | null {
  if (values.length === 0) return null;
  return { lower: quantile(values, 0.05), upper: quantile(values, 0.95) };
}

function bootstrap(
  families: readonly FamilyVerdict[],
  samples: readonly (readonly string[])[],
): BootstrapReport {
  const byId = new Map(families.map((family) => [family.familyId, family]));
  const domainValues: number[] = [];
  const operationValues: number[] = [];
  for (const sample of samples) {
    const selected = sample.map((familyId) => {
      const family = byId.get(familyId);
      if (family === undefined) {
        throw new TypeError(`bootstrap references unknown family ${familyId}`);
      }
      return family;
    });
    const report = qpcfr(selected);
    if (report.macroByDomain.value !== null) {
      domainValues.push(report.macroByDomain.value);
    }
    if (report.macroByOperation.value !== null) {
      operationValues.push(report.macroByOperation.value);
    }
  }
  return {
    unit: "case_family",
    samples: samples.length,
    macroByDomain: interval(domainValues),
    macroByOperation: interval(operationValues),
  };
}

function statistic(values: readonly number[]): SummaryStatistic {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? sorted[middle]
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  return {
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    median: median ?? 0,
  };
}

function efficiencyReport(
  families: readonly FamilyVerdict[],
): EfficiencyReport {
  const samples = families.flatMap((family) => family.efficiency);
  if (samples.length === 0) {
    return {
      state: "unmeasured",
      sampleCount: 0,
      wallTimeMs: null,
      inputTokens: null,
      outputTokens: null,
    };
  }
  return {
    state: "measured",
    sampleCount: samples.length,
    wallTimeMs: statistic(samples.map((sample) => sample.wallTimeMs)),
    inputTokens: statistic(samples.map((sample) => sample.inputTokens)),
    outputTokens: statistic(samples.map((sample) => sample.outputTokens)),
  };
}

function mergeCounts(counts: readonly StateCounts[]): StateCounts {
  const merged: StateCounts = {};
  for (const count of counts) {
    for (const state of RESULT_STATES) {
      merged[state] = (merged[state] ?? 0) + (count[state] ?? 0);
    }
  }
  for (const state of RESULT_STATES) {
    if (merged[state] === 0) delete merged[state];
  }
  return merged;
}

export function aggregateBenchmark(input: AggregateInput): BenchmarkReport {
  requireRelease(input.release);
  for (const family of input.families) requireRelease(family.release);
  const familyIds = input.families.map((family) => family.familyId);
  if (new Set(familyIds).size !== familyIds.length) {
    throw new TypeError("familyId values must be unique");
  }
  for (const [index, sample] of input.bootstrapSamples.entries()) {
    if (sample.length === 0) {
      throw new TypeError(`bootstrap fixture ${index} must not be empty`);
    }
  }
  return {
    release: RELEASE_ID,
    familyStateCounts: countStates(
      input.families.map((family) => family.state),
    ),
    trialStateCounts: mergeCounts(
      input.families.map((family) => family.trialStateCounts),
    ),
    qpcfr: qpcfr(input.families),
    bootstrap: bootstrap(input.families, input.bootstrapSamples),
    efficiency: efficiencyReport(input.families),
  };
}

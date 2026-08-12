import {
  DEFAULT_JUDGE_CAMPAIGN_CONFIG,
  type JudgeCampaignConfig,
} from "./judge-config.ts";

export type EvidenceState =
  "missing" | "unavailable" | "invalid" | "unmeasured";
export type EvidenceValue = number | { state: EvidenceState };

export interface JudgeReliabilityEvidence {
  balancedAccuracy: EvidenceValue;
  denominator: EvidenceValue;
}

export interface ActivationEvidenceInput {
  perJudgeBalancedAccuracy: Record<string, JudgeReliabilityEvidence>;
  panelBalancedAccuracy: EvidenceValue;
  criticalSensitivity: EvidenceValue;
  criticalFalsePositiveRate: EvidenceValue;
  promptContradictionRate: EvidenceValue;
  overallDisagreement: EvidenceValue;
  stratumDisagreement: Record<string, EvidenceValue>;
  requiredStrata: readonly string[];
  directContextQpcfrUplift: EvidenceValue;
  bootstrapLowerBound: EvidenceValue;
  irrelevantEffect: EvidenceValue;
  paraphraseInvariantPreservation: EvidenceValue;
  threeRunFamilyAgreement: EvidenceValue;
  coreStratumFamilyAgreement: Record<string, EvidenceValue>;
  requiredCoreStrata: readonly string[];
  cleanRunQpcfr: readonly EvidenceValue[];
  provenance: {
    benchCommit?: string;
    bankDigest?: string;
    evalCommit?: string;
    receiptDigests?: readonly string[];
    judgeConfigDigest?: string;
    calverRelease?: string;
  };
}

export interface ActivationCheck {
  name: string;
  state: "pass" | "fail" | EvidenceState;
  reason: string;
}

export interface ActivationDecision {
  state: "eligible" | "blocked";
  checks: ActivationCheck[];
  reasons: string[];
}

function measure(
  name: string,
  value: EvidenceValue | undefined,
  predicate: (value: number) => boolean,
  floor: string,
): ActivationCheck {
  if (value === undefined)
    return { name, state: "missing", reason: `${name} is missing` };
  if (typeof value !== "number")
    return { name, state: value.state, reason: `${name} is ${value.state}` };
  const pass = Number.isFinite(value) && predicate(value);
  return {
    name,
    state: pass ? "pass" : "fail",
    reason: pass
      ? `${name} satisfies ${floor}`
      : `${name} does not satisfy ${floor}`,
  };
}

function exactLabels(
  labels: readonly string[],
  map: Readonly<Record<string, unknown>>,
): boolean {
  if (
    labels.length === 0 ||
    new Set(labels).size !== labels.length ||
    labels.some((label) => label.trim() === "")
  )
    return false;
  const keys = Object.keys(map).sort();
  return (
    keys.length === labels.length &&
    keys.every((key, index) => key === [...labels].sort()[index])
  );
}

function reliabilityCheck(
  perJudge: Record<string, JudgeReliabilityEvidence>,
  config: JudgeCampaignConfig,
): ActivationCheck {
  const name = "per_judge_balanced_accuracy";
  const keys = Object.keys(perJudge).sort();
  if (
    keys.length !== config.models.length ||
    !config.models.every((model) => keys.includes(model))
  ) {
    return {
      name,
      state: "invalid",
      reason: "per-judge evidence must cover exactly Terra and Luna",
    };
  }
  for (const model of config.models) {
    const evidence = perJudge[model];
    if (!evidence)
      return {
        name,
        state: "invalid",
        reason: `${model} reliability evidence is missing`,
      };
    const accuracy = measure(
      name,
      evidence.balancedAccuracy,
      (value) => value >= 0.9,
      ">= 0.90",
    );
    if (accuracy.state !== "pass")
      return { ...accuracy, reason: `${model} ${accuracy.reason}` };
    if (
      typeof evidence.denominator !== "number" ||
      !Number.isSafeInteger(evidence.denominator) ||
      evidence.denominator <= 0
    ) {
      if (typeof evidence.denominator === "object") {
        return {
          name,
          state: evidence.denominator.state,
          reason: `${model} denominator is ${evidence.denominator.state}`,
        };
      }
      return {
        name,
        state: "invalid",
        reason: `${model} denominator must be a positive integer`,
      };
    }
  }
  return {
    name,
    state: "pass",
    reason: "both configured models meet reliability evidence floors",
  };
}

function mapCheck(
  declarationName: "required_strata" | "required_core_strata",
  measureName: "stratum_disagreement" | "core_stratum_family_agreement",
  labels: readonly string[],
  values: Record<string, EvidenceValue>,
): ActivationCheck[] {
  if (!exactLabels(labels, values)) {
    return [
      {
        name: declarationName,
        state: "invalid",
        reason: `${declarationName} must be non-empty unique labels`,
      },
      {
        name: measureName,
        state: "invalid",
        reason: `${measureName} must have exact declared coverage`,
      },
    ];
  }
  return [];
}

function provenanceCheck(
  name: string,
  value: string | readonly string[] | undefined,
  valid: (candidate: string) => boolean,
): ActivationCheck {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    return { name, state: "missing", reason: `${name} is missing` };
  }
  const values = Array.isArray(value) ? value : [value];
  if (!values.every(valid))
    return { name, state: "invalid", reason: `${name} is invalid` };
  return { name, state: "pass", reason: `${name} is valid` };
}

const isCommit = (value: string) => /^[0-9a-f]{40}$/.test(value);
const isDigest = (value: string) => /^sha256:[0-9a-f]{64}$/.test(value);

export function evaluateActivationEvidence(
  input: ActivationEvidenceInput,
  config: JudgeCampaignConfig = DEFAULT_JUDGE_CAMPAIGN_CONFIG,
): ActivationDecision {
  const checks: ActivationCheck[] = [];
  checks.push(reliabilityCheck(input.perJudgeBalancedAccuracy, config));
  checks.push(
    measure(
      "panel_balanced_accuracy",
      input.panelBalancedAccuracy,
      (value) => value >= 0.95,
      ">= 0.95",
    ),
  );
  checks.push(
    measure(
      "critical_sensitivity",
      input.criticalSensitivity,
      (value) => value >= 0.95,
      ">= 0.95",
    ),
  );
  checks.push(
    measure(
      "critical_false_positive_rate",
      input.criticalFalsePositiveRate,
      (value) => value <= 0.05,
      "<= 0.05",
    ),
  );
  checks.push(
    measure(
      "prompt_contradiction_rate",
      input.promptContradictionRate,
      (value) => value <= 0.05,
      "<= 0.05",
    ),
  );
  checks.push(
    measure(
      "overall_disagreement",
      input.overallDisagreement,
      (value) => value <= 0.1,
      "<= 0.10",
    ),
  );
  checks.push(
    ...mapCheck(
      "required_strata",
      "stratum_disagreement",
      input.requiredStrata,
      input.stratumDisagreement,
    ),
  );
  if (exactLabels(input.requiredStrata, input.stratumDisagreement)) {
    for (const stratum of input.requiredStrata)
      checks.push(
        measure(
          `stratum_disagreement:${stratum}`,
          input.stratumDisagreement[stratum],
          (value) => value <= 0.15,
          "<= 0.15",
        ),
      );
  }
  checks.push(
    measure(
      "direct_context_qpcfr_uplift",
      input.directContextQpcfrUplift,
      (value) => value >= 0.1,
      ">= 0.10",
    ),
  );
  checks.push(
    measure(
      "bootstrap_lower_bound",
      input.bootstrapLowerBound,
      (value) => value > 0,
      "> 0",
    ),
  );
  checks.push(
    measure(
      "irrelevant_effect",
      input.irrelevantEffect,
      (value) => value >= -0.05 && value <= 0.05,
      "[-0.05, 0.05]",
    ),
  );
  checks.push(
    measure(
      "paraphrase_invariant_preservation",
      input.paraphraseInvariantPreservation,
      (value) => value >= 0.95,
      ">= 0.95",
    ),
  );
  checks.push(
    measure(
      "three_run_family_agreement",
      input.threeRunFamilyAgreement,
      (value) => value >= 0.8,
      ">= 0.80",
    ),
  );
  checks.push(
    ...mapCheck(
      "required_core_strata",
      "core_stratum_family_agreement",
      input.requiredCoreStrata,
      input.coreStratumFamilyAgreement,
    ),
  );
  if (exactLabels(input.requiredCoreStrata, input.coreStratumFamilyAgreement)) {
    for (const stratum of input.requiredCoreStrata)
      checks.push(
        measure(
          `core_stratum_family_agreement:${stratum}`,
          input.coreStratumFamilyAgreement[stratum],
          (value) => value >= 0.7,
          ">= 0.70",
        ),
      );
  }
  if (input.cleanRunQpcfr.length !== 2) {
    checks.push({
      name: "clean_run_qpcfr_difference",
      state: "invalid",
      reason: "clean_run_qpcfr requires exactly two values",
    });
  } else {
    const [first, second] = input.cleanRunQpcfr;
    if (first === undefined || second === undefined) {
      checks.push({
        name: "clean_run_qpcfr_difference",
        state: "invalid",
        reason: "clean_run_qpcfr requires exactly two values",
      });
    } else if (typeof first !== "number")
      checks.push({
        name: "clean_run_qpcfr_difference",
        state: first.state,
        reason: `clean_run_qpcfr is ${first.state}`,
      });
    else if (typeof second !== "number")
      checks.push({
        name: "clean_run_qpcfr_difference",
        state: second.state,
        reason: `clean_run_qpcfr is ${second.state}`,
      });
    else
      checks.push(
        measure(
          "clean_run_qpcfr_difference",
          Math.abs(first - second),
          (value) => value <= 0.05 + Number.EPSILON,
          "<= 0.05",
        ),
      );
  }
  const provenance = input.provenance;
  checks.push(
    provenanceCheck(
      "provenance:bench_commit",
      provenance.benchCommit,
      isCommit,
    ),
  );
  checks.push(
    provenanceCheck("provenance:bank_digest", provenance.bankDigest, isDigest),
  );
  checks.push(
    provenanceCheck("provenance:eval_commit", provenance.evalCommit, isCommit),
  );
  checks.push(
    provenanceCheck(
      "provenance:receipt_digests",
      provenance.receiptDigests,
      isDigest,
    ),
  );
  checks.push(
    provenanceCheck(
      "provenance:judge_config_digest",
      provenance.judgeConfigDigest,
      isDigest,
    ),
  );
  checks.push(
    provenanceCheck(
      "provenance:calver_release",
      provenance.calverRelease,
      (value) => value === "2026.8.12",
    ),
  );
  const reasons = checks
    .filter((check) => check.state !== "pass")
    .map((check) => check.reason);
  return {
    state: reasons.length === 0 ? "eligible" : "blocked",
    checks,
    reasons,
  };
}

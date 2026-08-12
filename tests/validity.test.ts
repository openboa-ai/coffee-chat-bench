import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateActivationEvidence,
  type ActivationEvidenceInput,
} from "../src/validity.ts";

const sha = (letter: string) => `sha256:${letter.repeat(64)}`;
const commit = (letter: string) => letter.repeat(40);

const complete = (): ActivationEvidenceInput => ({
  perJudgeBalancedAccuracy: {
    "gpt-5.6-terra": { balancedAccuracy: 0.9, denominator: 20 },
    "gpt-5.6-luna": { balancedAccuracy: 0.91, denominator: 20 },
  },
  panelBalancedAccuracy: 0.95,
  criticalSensitivity: 0.95,
  criticalFalsePositiveRate: 0.05,
  promptContradictionRate: 0.05,
  overallDisagreement: 0.1,
  stratumDisagreement: { direct: 0.15, irrelevant: 0.1 },
  requiredStrata: ["direct", "irrelevant"],
  directContextQpcfrUplift: 0.1,
  bootstrapLowerBound: 0.0001,
  irrelevantEffect: -0.05,
  paraphraseInvariantPreservation: 0.95,
  threeRunFamilyAgreement: 0.8,
  coreStratumFamilyAgreement: { direct: 0.7 },
  requiredCoreStrata: ["direct"],
  cleanRunQpcfr: [0.5, 0.55],
  provenance: {
    benchCommit: commit("a"),
    bankDigest: sha("b"),
    evalCommit: commit("c"),
    receiptDigests: [sha("d")],
    judgeConfigDigest: sha("e"),
    calverRelease: "2026.8.12",
  },
});

test("activation is conjunctive and accepts exact two-model floors", () => {
  const result = evaluateActivationEvidence(complete());
  assert.equal(result.state, "eligible");
  assert.ok(result.checks.every((check) => check.state === "pass"));
});

test("per-model evidence and stratum maps require exact non-empty coverage", () => {
  const input = complete();
  input.perJudgeBalancedAccuracy = {
    "gpt-5.6-terra": { balancedAccuracy: 1, denominator: 20 },
  };
  input.requiredStrata = ["direct", "direct", ""];
  input.stratumDisagreement = { direct: 0.1, extra: 0.1 };
  input.requiredCoreStrata = ["direct", "extra"];
  input.coreStratumFamilyAgreement = { direct: 0.8 };
  const result = evaluateActivationEvidence(input);
  assert.deepEqual(
    result.checks
      .filter((check) => check.state === "invalid")
      .map((check) => check.name),
    [
      "per_judge_balanced_accuracy",
      "required_strata",
      "stratum_disagreement",
      "required_core_strata",
      "core_stratum_family_agreement",
    ],
  );
});

test("per-model reliability cannot pass without a positive denominator", () => {
  const input = complete();
  input.perJudgeBalancedAccuracy["gpt-5.6-luna"] = {
    balancedAccuracy: 1,
    denominator: 0,
  };
  const result = evaluateActivationEvidence(input);
  assert.equal(
    result.checks.find((check) => check.name === "per_judge_balanced_accuracy")
      ?.state,
    "invalid",
  );
});

test("requires exactly two clean run values without collapsing non-measured states", () => {
  const input = complete();
  input.cleanRunQpcfr = [0.5, { state: "unavailable" }, 0.5];
  const result = evaluateActivationEvidence(input);
  const check = result.checks.find(
    (entry) => entry.name === "clean_run_qpcfr_difference",
  );
  assert.equal(check?.state, "invalid");
  assert.match(check?.reason ?? "", /exactly two/);
});

test("threshold failures are independently named without compensation", () => {
  const input = complete();
  input.panelBalancedAccuracy = 0.949;
  input.bootstrapLowerBound = 0;
  input.irrelevantEffect = 0.051;
  const result = evaluateActivationEvidence(input);
  assert.deepEqual(
    result.checks
      .filter((check) => check.state === "fail")
      .map((check) => check.name),
    ["panel_balanced_accuracy", "bootstrap_lower_bound", "irrelevant_effect"],
  );
});

test("independently distinguishes missing and malformed provenance fields", () => {
  const input = complete();
  delete input.provenance.benchCommit;
  input.provenance.bankDigest = "sha256:uppercase";
  input.provenance.evalCommit = "ABC";
  input.provenance.receiptDigests = [];
  input.provenance.judgeConfigDigest = "bad";
  input.provenance.calverRelease = "2026.08.12";
  const result = evaluateActivationEvidence(input);
  assert.deepEqual(
    result.checks
      .filter((check) => check.name.startsWith("provenance:"))
      .map((check) => [check.name, check.state]),
    [
      ["provenance:bench_commit", "missing"],
      ["provenance:bank_digest", "invalid"],
      ["provenance:eval_commit", "invalid"],
      ["provenance:receipt_digests", "missing"],
      ["provenance:judge_config_digest", "invalid"],
      ["provenance:calver_release", "invalid"],
    ],
  );
});

# Benchmark design

## Status and scope

Coffee Chat Bench is `not_active`. It owns a candidate-independent runtime, a
complete fixed public synthetic bank, a candidate-neutral Harbor task
projection, and a fixed blind qualification package. It does not yet own
independent human semantic review, human labels, qualified-judge evidence,
candidate execution, system results, an active score, or a leaderboard. Eval
has exercised the projection with installed-Harbor Oracle controls; those are
pipeline evidence only.

The bounded construct is **fixed synthetic judgment-policy application**:
whether a candidate applies a declared synthetic target policy to a fixed task
packet in the preregistered direction while preserving utility and integrity.
It is not a claim about authentic-human judgment transfer, a whole person,
population behavior, or Coffee Chat Product performance.

Candidate kind is not an eligibility rule. The candidate identity records the
model, harness, adaptation/context mechanism, tool policy, and configuration.
All candidates receive the same observable task and evidence contract; Product
internals cannot provide benchmark credit.

## Forms and conditions

The bank reports dialogue response and professional task artifact forms
separately. No rate, gate, or inference pools them by default.

Every family contains these five candidate-visible conditions:

| Condition                | Role                                                 |
| ------------------------ | ---------------------------------------------------- |
| `task_only`              | Task without target context                          |
| `nondiagnostic_target_a` | Exposure-matched non-diagnostic control for target A |
| `nondiagnostic_target_b` | Exposure-matched non-diagnostic control for target B |
| `diagnostic_target_a`    | Declared synthetic target-A policy context           |
| `diagnostic_target_b`    | Declared synthetic target-B policy context           |

The bank, not generic runtime code, preregisters the intended semantic contrasts
and their expected directions. `release_a` is the primary public slice.
`release_b` is a second fixed robustness slice, not untouched or independent
replication.

## Runtime contracts and operations

The public package exports five compact contracts:

- `CaseManifest`: candidate-visible task data, five condition payloads,
  sealed-file digests, form/split/lineage identities, and output contract.
- `RunReceipt`: bound candidate, task, session, execution, cleanup, artifact,
  and explicit failure evidence.
- `JudgmentRecord`: a declared slot, ordered bound receipts/artifacts, frozen
  rubric projection/configuration, judge votes, and resolved state.
- `BenchmarkReport`: exact release/form census, provenance, coverage,
  uncertainty, and derived rates.
- `ActivationAudit`: explicit evidence states and blockers for the decision to
  activate; it cannot make the repository active.

The only scoring operations are:

```text
validate-bank -> render-case -> validate-output -> judge -> report
```

`validate-bank` validates the exact bank census, sealed JSON, split lineage,
and judgment plan. `render-case` reveals only one candidate-visible condition.
`validate-output` verifies objective artifact bytes and citation constraints.
`judge` revalidates artifact bytes before creating a record. `report` derives
only from the exact bank, receipts, and judgment records; caller-authored
aggregate rates and omitted cases are rejected. `activation-audit` binds an
evidence manifest to the bank and preserves missing or inconclusive gates.

## Harbor projection boundary

The Bench-owned projector turns the validated 16-family bank into exactly 80
digest-named Harbor tasks. A task contains one rendered condition, a pinned
no-network environment, an objective output contract, a structural Oracle, and
a structural verifier. Condition and target identities, other contexts,
rubrics, judgment plans, expected directions, system identities, and
credentials remain outside every task directory.

The Harbor reward is only structural conformance with `validate-output`: file
presence, byte limit, UTF-8 without a byte-order mark, and required evidence
references. Eval owns the installed Harbor version, system adapters, execution,
isolation evidence, receipts, and semantic judging. Therefore a successful
Oracle is projection evidence, not a benchmark score.

## Sealed judgment plan and judge rule

Each sealed case judgment-plan file has one flat `judgmentPlan`. A slot names its stable
`judgmentId`, optional `pairId`, mode, dimension, canonical/mirrored
orientation when pairwise, ordered conditions, exact rubric projection ID and
digest, and expected verdict. A pair has exactly canonical and mirrored slots,
opposite order/direction, and one rubric projection.

The plan file declares `project_author_hypothesis` authority and is not human
annotation evidence. Its task-utility pairs use
`left_or_tie`/`right_or_tie` expectations to encode non-inferiority against
task-only work. Any utility uplift is reported as an observed effect, not
treated as a predeclared correct direction.

Judging is stateless and treatment-blind: candidate, harness, model, host,
condition, target identity, baseline direction, and orientation do not enter
the judge-visible payload. The task, evidence, rubric projection, and anonymous
output bytes do enter because those facts are necessary to judge the declared
dimension. The two frozen primary judge models, Terra and Luna, must agree and
the independent cross-validation model, Sol, must return the same verdict
before a model outcome is measured. Sol never resolves a primary disagreement.
All three model identities require independently human-referenced
qualification; the current Sol-generated qualification material is provenance,
not that qualification evidence.

Judge qualification is lineage-bound rather than asserted by a free-form
digest. Runtime configuration records bind the release, protocol, study,
resolved model identity, and exact qualification evidence. Protocol or study
drift therefore requires new qualification evidence.
Configuration authority is process-local and cannot be restored from a
serialized digest envelope; evaluator processes re-derive it from the frozen
study, raw records, and votes.

For pairwise slots, equal valid artifact digests are a semantic tie. Otherwise
the report requires both orientations to select the same semantic artifact (or
both tie); orientation inconsistency is unavailable, not a candidate failure.

## Accounting and nonnumeric states

Only succeeded receipts with passed leakage evidence and succeeded cleanup may
enter semantic judgment or numeric accounting. Each family needs five distinct
session digests and an exact unique order permutation across its five
conditions. Missing, invalid, unavailable, failed, abstained, disagreement,
leakage, and cleanup states remain explicit.

QPCFR is a family-level non-compensatory rate. A family is numeric only when its
five receipts are eligible and all fixed dimensions—target alignment, task
utility, evidence integrity, target specificity, and critical failure—are
declared and measured. The report exposes receipt, cleanup, judgment, and
family censuses separately, with coverage and uncertainty beside each rate.

## Validity boundary

Code checks objective binding, isolation evidence, parser behavior, and metric
arithmetic. They do not validate the bank's semantic targets, human relevance,
judge calibration, reliability, or usefulness. Those claims require the
prospective evidence and falsifiers in
[the validity argument](validity/validity-argument-and-evidence-plan.md).

The design follows the distinction between score interpretation and use in the
[Standards for Educational and Psychological Testing](https://www.testingstandards.net/uploads/7/6/6/4/76643089/standards_2014edition.pdf),
[Messick's validity framework](https://doi.org/10.1037/0003-066X.50.9.741), and
[Kane's argument-based approach](https://doi.org/10.1111/jedm.12000). Benchmark
lifecycle evidence is guided by
[BetterBench](https://proceedings.neurips.cc/paper_files/paper/2024/hash/26889e8359e7ef8a7f5d77457364ca55-Abstract-Datasets_and_Benchmarks_Track.html).

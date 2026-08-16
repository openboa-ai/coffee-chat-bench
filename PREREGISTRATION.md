# Fixed synthetic bank preregistration

## Status and timing

This document freezes the intended analysis before candidate artifacts, human
labels, judge qualification evidence, or official scores are collected. The
repository remains `not_active`.

## Research question

For a fixed synthetic task and evidence packet, does diagnostic history for a
declared decision policy produce policy-specific behavior beyond task-only and
exposure-matched nondiagnostic history while preserving utility, integrity, and
critical constraints?

## Units, conditions, and strata

The family is the clustered analysis unit. Every family has exactly five fresh
candidate conditions:

- `task_only`;
- `nondiagnostic_target_a` and `nondiagnostic_target_b`;
- `diagnostic_target_a` and `diagnostic_target_b`.

The 12 scored families are reported separately by `release_a`/`release_b` and
dialogue/professional-artifact form. Results are not silently pooled.
`release_b` is a fixed public robustness slice, not an untouched replication.
The four `judge_qualification` families never enter candidate scores.

## Frozen policy blocks

- S1: A = reversible field learning; B = operational readiness.
- S2: A = predictive robustness; B = mechanism and falsifiability.
- S3: A = coordination legibility; B = local evidence ownership.

The labels A and B are bookkeeping only. Neither side is globally superior.
Each case must make both policies defensible and may reverse the surface action
that a shallow label classifier would associate with a policy.

## Frozen 18-row judgment plan

Every family declares six semantic pair contrasts, each with canonical and
mirrored presentation:

1. diagnostic A versus diagnostic B under the A-alignment projection;
2. diagnostic B versus diagnostic A under the B-alignment projection;
3. diagnostic A versus nondiagnostic A for A-specificity;
4. diagnostic B versus nondiagnostic B for B-specificity;
5. diagnostic A versus task-only for task-utility non-inferiority;
6. diagnostic B versus task-only for task-utility non-inferiority.

The mirrored row reverses condition order and expected left/right direction
while preserving one rubric projection. Six pointwise pass floors cover each
diagnostic condition on task utility, evidence integrity, and critical failure.
Utility pairs accept the diagnostic artifact winning or tying; they do not
predeclare improvement. Any uplift is a direction-free effect estimate.
Expected verdicts are project-author construction hypotheses, not criterion
labels. Every plan file declares that authority and remains distinct from later
independent human evidence.

Each rubric has only seven narrow semantic projections: A/B alignment, A/B
specificity, utility, integrity, and critical failure. The judge evaluates the
criterion holistically; keyword counts and rule tallies do not award semantic
credit.

## Proposed family gate and missingness

A future family result is numeric only if all five executions are isolated and
eligible, every declared judgment is available, canonical and mirrored results
select the same semantic artifact, the two frozen primary judges concur, the Sol
cross-validation judge matches that consensus, and all five dimensions are
measured. Utility, integrity, specificity, alignment, and critical failure are
non-compensatory.

Missing, invalid, failed, unavailable, abstained, disputed, leaked,
cleanup-failed, orientation-inconsistent, or judge-disagreeing evidence remains
nonnumeric. It is never converted to zero or silently omitted. Reports must show
planned and measured denominators plus conditional rates and bounds.

## Human criterion and judge qualification

Independent dimension-trained annotators must label blinded qualification
artifacts before model judges are run. Construction hypotheses are hidden.
Human disagreement and abstention remain explicit rather than forced into a
criterion label. Only unanimous non-abstaining annotations enter the
high-consensus reference subset. Canonical and mirrored presentations use
separated assignment.

`gpt-5.6-terra` and `gpt-5.6-luna` are the frozen primary judges, and
`gpt-5.6-sol` is the cross-validation judge. All three require independent
qualification and exact concurrence after qualification. Sol never adjudicates
a primary disagreement.
The public qualification artifacts are project-agent-assisted synthetic
material generated outside the primary roster; their construction hypotheses
are hidden from annotators and cannot substitute for human labels. The frozen
thresholds and assignment procedure live in `qualification/PROTOCOL.md` and
`qualification/study.json`. No current judge is qualified.

## Falsifiers and audits

The construct is narrowed or rejected when any of the following occurs:

- nondiagnostic or task-only conditions reproduce the diagnostic contrast;
- a lexical, style, verbosity, label, retrieval, or surface-action baseline
  reproduces expected directions;
- diagnostic history states the held-out answer or nondiagnostic history leaks
  the operative policy;
- independent reviewers cannot defend both policies or match exposure and
  information density;
- A/B cross-scoring, mirrored ordering, human labels, or qualified judges fail;
- utility, integrity, or critical constraints fail despite apparent alignment.

Mechanical overlap, length, and lineage results are recorded separately from
semantic review. No code check can satisfy these empirical falsifiers.

## Exposure and claim boundary

The bank is intentionally public and prospective. Candidate/model versions,
release dates, and possible prior exposure must be reported. There is no
unobserved-secrecy claim.

Even after a successful future audit, the strongest permitted interpretation is
limited to named fixed synthetic cases and forms. This preregistration does not
establish authentic-human transfer, population validity, product performance,
judge validity, a leaderboard, or benchmark activation.

# Public judgment-history bank preregistration

## Status

The repository remains `not_active`. This document fixes the experimental
question, sampling matrix, measurement decomposition, and claim boundary before
candidate results are interpreted.

## Research question

Holding task and evidence fixed, does conditioning an agent on one target's
prior decision history produce held-out judgments that align with that target,
remain distinguishable from a matched alternative, and preserve task
performance and evidence grounding?

This operational estimand is `target-conditioned judgment alignment` within the
broader personalized-alignment research area. The candidate class is agent
systems. Direct one-shot model completions are out of scope.

## Fixed bank

The public benchmark bank contains:

- 8 matched target pairs and 16 synthetic targets;
- 8 prior decision records per target;
- 32 multi-document case families;
- 3 conditions per case: `unconditioned`, `target_a`, and `target_b`;
- 96 agent-condition projections;
- 8 domains, 2 forms, 2 task modes, 4 task archetypes, and 4 transfer types;
- 5 separately authored documents per case.

Every pair has one `near_transfer`, `far_transfer`, `boundary_condition`, and
`cue_conflict` case. The full matrix is fixed in
[`bank/sampling-plan.json`](bank/sampling-plan.json).

## Conditions and candidate boundary

- `unconditioned`: task and documents only;
- `target_a`: task, documents, and target A history;
- `target_b`: task, documents, and target B history.

The renderer exposes exactly one condition. It does not expose condition names,
target identities, the other history, construction annotations, reference
labels, or Judge configuration.

Every candidate returns a final text artifact and a structured decision record.
The record contains only stated decision evidence: decision, visible source
use, trade-offs, constraint handling, and uncertainty. It is not hidden
chain-of-thought or an execution trace.

## Fixed pointwise measurements

- `judgment_alignment`: 1–5, target conditions only;
- `stated_rationale_alignment`: four 1–5 diagnostic facets, target conditions
  only;
- `task_performance`: 1–5 in all conditions;
- `evidence_grounding`: 1–5 in all conditions; and
- `hard_constraint_violation`: true, false, or abstain in all conditions.

Each dimension uses an independent Judge call and dimension-specific anchors.
Only `stated_rationale_alignment` receives the decision record. No dimension is
collapsed into a composite score.

## Fixed pairwise comparisons

For every complete case family, the evaluator compares:

1. target A versus unconditioned under target-A history;
2. target B versus unconditioned under target-B history;
3. target A versus target B under target-A history; and
4. target B versus target A under target-B history.

Each comparison is repeated in reversed artifact order. Canonical and mirrored
responses must normalize to the same winner or tie. Otherwise the result is
`order_inconsistent` and nonnumeric.

Pairwise prompts contain one selected history, task/evidence, and two final
artifacts. They contain no decision records, condition labels, target IDs, or
pointwise scores.

`boundary_condition` convergence is observed when both target-specificity
comparisons tie and both conditioned artifacts comply with the shared hard
constraint. The evaluator does not apply score thresholds to create an overall
`transferred` verdict.

## Evidence state

The AI judge is required because open-ended semantic alignment cannot be fully
verified by deterministic rules. Before genuine human criterion annotation,
its measurements have `provisional` evidence status. Later blinded human labels
are required to estimate agreement, reliability, calibration, abstention, and
bias; they are not required for the evaluator interface to exist.

Project-owner review is construction QA, not independent human criterion
evidence. Missing, invalid, unavailable, abstained, and order-inconsistent
results remain nonnumeric.

## Falsifiers

The interpretation must be narrowed or the data repaired if:

- target direction can be recovered without the supplied history;
- style, length, option tokens, IDs, or document order identify a target;
- a held-out task repeats a historical answer;
- one target is defensible only by violating the objective task contract;
- decision-record wording improves artifact-level scores without a better
  artifact;
- canonical and mirrored pairwise results are systematically inconsistent;
- a boundary condition is solved by blindly reversing target direction;
- increased judgment alignment requires lower task performance or evidence
  grounding; or
- future human criterion evidence disagrees systematically by form, domain,
  transfer type, or task mode.

Mechanical audits cannot satisfy semantic falsifiers.

## Claim boundary

The bank is synthetic, public, small, and prospective. Passing repository tests
establishes contract and construction consistency only. It does not establish
construct validity, human agreement, AI-judge qualification, population
validity, unseen-task generalization, candidate performance, an active score,
or a leaderboard.

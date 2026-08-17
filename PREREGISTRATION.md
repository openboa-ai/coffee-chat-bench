# Public judgment-history bank preregistration

## Status

The repository remains `not_active`. This document fixes the dataset question,
sampling matrix, and claim boundary before candidate executions or semantic
scores are collected.

## Research question

Given the same task and evidence, can an agent infer a stable decision policy
from a target's judgment history and transfer that policy to a held-out task
while preserving task performance and evidence grounding?

The candidate class is agent systems. A direct one-shot language-model
completion is out of scope. The bank does not claim authentic human judgment,
whole-person understanding, population generalization, or Coffee Chat product
performance.

## Bank and sampling

There is one public benchmark bank. It contains:

- 8 matched target pairs and 16 synthetic targets;
- 8 historical judgment records per target;
- 32 held-out case families;
- 3 conditions per case: `unconditioned`, `target_a`, `target_b`;
- 96 agent-condition executions in the full projection.

Each pair has one `near_transfer`, one `far_transfer`, one `boundary`, and one
`policy_conflict` case. Each pair has two dialogue and two
professional-artifact cases, two bounded and two open-ended tasks. Across the
bank, eight domains and four task archetypes are balanced as declared in
[`bank/sampling-plan.json`](bank/sampling-plan.json).

Each target history has five diagnostic episodes, two boundary episodes, and
one distractor episode. The four record formats occur twice each. A/B records
share situations, evidence identifiers, and format positions; only the
decision content and partial rationale may differ. History length is balanced
within ten percent.

## Conditions and execution boundary

- `unconditioned`: task and evidence only;
- `target_a`: task, evidence, and target A history;
- `target_b`: task, evidence, and target B history.

The renderer passes one selected history to the candidate. The candidate does
not receive the condition name, target identity, other target, hidden policy,
or evaluator criterion. The public repository necessarily stores both target
contexts for reproducible rendering; an adapter must never pass both to one
execution.

## Criterion hypothesis

Each evaluator material records:

- three ordered decision cues for each target;
- one shared safety/integrity veto and its boundary condition;
- one target-specific tie-breaker;
- expected decision features and reasoning features;
- allowed alternatives;
- task-performance and evidence-grounding conditions;
- case-defined critical failures.

Every criterion is explicitly marked:

```text
authority: project_author_hypothesis
humanReviewed: false
```

These are construction hypotheses, not human criterion labels.

## Planned measurement

Objective verification handles encoding, byte limits, required references, and
artifact structure. The required semantic measurement layer is an AI judge
(LLM-as-a-judge) for policy adherence, policy transfer, task performance,
evidence grounding, and critical failure.

The first judge implementation may operate in `provisional` state for
development and hill climbing. Human criterion annotation is a later required
reference for judge reliability, calibration, disagreement, abstention, and
validity evidence. Lack of human annotations limits interpretation; it does not
remove the AI judge from the pipeline.

Missing, invalid, unavailable, skipped, abstained, or judge-disagreeing states
remain nonnumeric. They are never converted to zero or silently omitted.

## Falsifiers

The design must be narrowed or revised if any of these occurs:

- a candidate can obtain the target-specific direction without the judgment
  history;
- policy names, answer wording, option tokens, style, length, or evidence IDs
  reveal the target direction;
- the held-out case repeats a situation, answer, or rationale from the history;
- an independent construction reviewer cannot recover the intended cue
  priorities, veto, and tie-breaker from the history;
- either target is only defensible by violating the task's objective contract;
- a boundary case is solved by blindly reversing the A/B direction;
- required evidence grounding or critical constraints are lost when policy
  adherence improves;
- future human criterion labels and the AI judge show poor agreement or
  systematic form/domain disagreement.

Mechanical audits record census, digest binding, identity parity, length parity,
and path separation. They cannot satisfy the semantic falsifiers.

## Claim boundary

The bank is synthetic, public, small, and prospective. Passing repository tests
establishes only contract and construction consistency. It does not establish
construct validity, criterion validity, human agreement, population validity,
unseen-task generalization, agent performance, an active score, or a
leaderboard. Activation requires a separate evidence review and remains
blocked while required evidence is missing.

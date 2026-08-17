# Public benchmark bank data card

## Status

Repository status is `not_active`. The repository contains one public,
synthetic benchmark bank and its evaluator-only construction material. It does
not contain candidate results, a public score, a leaderboard, or an activation
decision.

## Intended use

The bank is for evaluating **agent systems**, not direct one-shot language
model completions. A candidate receives a task, its evidence packet, an output
contract, and one selected judgment history. The intended question is:

> Can an agent infer a stable decision policy from the supplied history and
> transfer it to a held-out task while preserving task performance and evidence
> grounding?

The bank is candidate-independent. It does not require Coffee Chat and does
not award Coffee Chat product credit. `coffee-chat-eval` may consume the bank
through an adapter, but provider credentials, agent harnesses, host execution,
and performance reports are outside this repository.

## One public dataset

Externally, users select only the `public benchmark bank`. There are no public
development, pilot, release, holdout, or judge-qualification datasets in this
initial bank. Internal construction and future qualification work are tracked
as evidence states and evaluator material, not as additional datasets that a
candidate must choose.

## Census

| Unit                            |                                                                                  Count |
| ------------------------------- | -------------------------------------------------------------------------------------: |
| Matched target pairs            |                                                                                      8 |
| Synthetic targets               |                                                                                     16 |
| History records per target      |                                                                                      8 |
| Case families                   |                                                                                     32 |
| Conditions per case             |                                                                                      3 |
| Full agent-condition executions |                                                                                     96 |
| Domains                         |                                                                            8 × 4 cases |
| Forms                           |                                                 16 dialogue + 16 professional artifact |
| Transfer types                  |                         8 near-transfer, 8 far-transfer, 8 boundary, 8 policy-conflict |
| Task archetypes                 | 8 recommendation, 8 allocation/prioritization, 8 design/threshold, 8 critique/revision |

Each pair has exactly four held-out cases: one for each transfer type. Each
pair has two dialogue cases and two professional-artifact cases; two tasks are
bounded and two are open-ended. The sampling matrix is frozen in
[`bank/sampling-plan.json`](bank/sampling-plan.json).

## Target histories

Each matched pair contains target A and target B. They see the same historical
situations, evidence identifiers, and record formats, but make different,
defensible decisions. Each history contains:

- five episodes that distinguish the two decision policies;
- two boundary episodes where a safety or task constraint makes the decisions
  converge; and
- one distractor episode that should not identify the policy.

The four record formats occur exactly twice per target:
`decision_note`, `message_excerpt`, `retrospective`, and `structured_log`.
At most four records include a partial rationale. The first five records are
diagnostic and differ between A and B; the next two are boundary records where
the shared constraint makes the decisions converge; the final distractor is
neutral and also converges. Policy names, personality labels, target identity,
and held-out answers are not candidate-visible. History lengths are balanced
within 10% for every pair without artificial whitespace padding.

## Candidate and evaluator boundary

The candidate-visible material is under [`bank/public/`](bank/public/). It
contains the task, evidence, output contract, and both target contexts in the
canonical manifest so the renderer can select one condition deterministically.
At execution time, `renderCase` exposes only the selected context:

```text
unconditioned -> task + evidence + no history
target_a      -> task + evidence + target A history
target_b      -> task + evidence + target B history
```

The evaluator-only material is under [`bank/evaluator/`](bank/evaluator/). It
contains the policy hypothesis, history-role labels, expected decision and
reasoning features, allowed alternatives, task-performance conditions,
evidence-grounding conditions, and critical failures. It is not passed to the
agent or copied into the Harbor task.

## Criterion and judge status

Every evaluator criterion currently declares:

```text
authority: project_author_hypothesis
humanReviewed: false
```

The future semantic measurement layer is an AI judge (LLM-as-a-judge), because
open-ended policy adherence and utility cannot be reduced to keyword or format
rules. The next implementation step will define the fixed judge protocol and
allow a `provisional` judge to support development measurement. Human criterion
annotation remains a required later step for reliability, calibration, and
validity evidence. It is not a prerequisite for the AI judge to exist or run.

Objective verification remains separate and checks only explicit contracts:
encoding, byte limits, required evidence references, and artifact structure.
AI-judge failure, abstention, disagreement, invalid output, unavailable
provider, or missing evidence remains nonnumeric.

## Provenance and rights

The bank is newly authored synthetic material. Evidence uses synthetic URIs and
MIT licensing declarations. File and source provenance are recorded in
[`RIGHTS-PROVENANCE.jsonl`](RIGHTS-PROVENANCE.jsonl). The bank is public and
prospective, so [`CONTAMINATION.jsonl`](CONTAMINATION.jsonl) records exposure
risk without making a secrecy or contamination-free claim.

## Quality gates

`npm run data:audit` checks the fixed census, pair and sampling matrix,
condition cardinality, history format balance, A/B evidence parity, length
parity, evaluator/public separation, synthetic provenance, and digest binding.
The Harbor projection checks that exactly 96 candidate tasks can be materialized
without evaluator material.

The project agent also directly reviewed all histories and held-out cases for
coherent policy conflicts, defensibility, complete decision inputs, arithmetic
and resource consistency, boundary convergence, and cross-domain transfer. The
review and the defects corrected during it are recorded in
[`docs/validity/bank-development-review.md`](docs/validity/bank-development-review.md).
Because the reviewer also authored the rewrite, this is project-side
construction QA rather than independent or human validation.

These are construction and contract checks. They do not establish that the
synthetic policies are psychologically authentic, that humans would agree with
the criteria, that an AI judge is reliable, or that an agent benefits from the
history. Those claims require the future validity evidence plan.

## Known limitations and next evidence

- The bank is small, synthetic, and public.
- Eight target pairs do not represent a population of users or values.
- The cases test controlled policy transfer, not whole-person modeling or
  preference discovery.
- No genuine human criterion annotations have been collected yet.
- No AI judge has been qualified against human criterion evidence yet.
- No candidate execution report or active benchmark score is published.

The next evidence sequence is: implement the fixed AI-judge contract, run
provisional development measurements, collect blinded human criterion labels
when resources permit, assess agreement/reliability and calibration, then
revisit the benchmark's validity and activation decision. Until then the
repository remains `not_active`.

# Public Judgment-History Bank rebuild

## Objective

Rebuild the candidate-independent benchmark bank around one bounded question:

> Given the same task and evidence, can an agent infer a stable conditional
> judgment policy from a target's decision history and apply it to held-out
> tasks while preserving task performance and evidence grounding?

The bank is synthetic and remains `not_active`. It does not claim authentic
human generalization, temporal preference change, whole-person understanding,
or Coffee Chat product performance.

## Global constraints

- The public surface is one `public benchmark bank`; do not expose development,
  pilot, release, or qualification datasets as selectable benchmark splits.
- Candidate scope is agent systems only. One-shot language-model completions
  are out of scope; judge model calls are evaluator infrastructure.
- Census is exactly 8 matched target pairs, 16 targets, 8 histories per target,
  4 held-out tasks per pair, 32 case families, 3 conditions, and 96 agent
  executions.
- Conditions are exactly `unconditioned`, `target_a`, and `target_b`.
- Each pair has five diagnostic episodes, two convergent boundary episodes, and
  one distractor, using each of four record formats twice.
- Each pair has one `near_transfer`, `far_transfer`, `boundary`, and
  `policy_conflict` task; two dialogue and two professional-artifact forms;
  two bounded and two open-ended tasks.
- Eight domains and four task archetypes are balanced four and eight times,
  respectively, by a checked `sampling-plan.json`.
- Candidate-visible material and evaluator-only policy/criterion material are
  physically separated. Hidden policies and criteria never enter Harbor tasks.
- Criteria use expected decision/reasoning features, allowed alternatives,
  task-performance conditions, evidence-grounding conditions, and critical
  failures. Every criterion is marked
  `authority: project_author_hypothesis` and `humanReviewed: false`.
- Deterministic checks validate objective contracts only. They never award
  open-ended semantic alignment or utility.
- `npm run data:audit` must produce an inspectable JSON report and reject old
  split, condition, qualification, or census identifiers.
- AI construction review may reject a pair and must preserve model, prompt,
  and result provenance. It is construction QA, not human criterion evidence
  or construct validity.
- Do not implement or qualify the AI judge in this PR. The next PR consumes the
  new criterion contract and starts with a provisional judge state.
- Use one CalVer update only; add no compatibility layer or second dataset
  version axis. Preserve the unrelated `docs/validity/activation-evidence.json`
  modification outside this worktree.

## Task 1 — contract cutover

Write failing contract tests for the new bank, condition, evaluator
   separation, and Harbor census; then implement the minimal new contracts and
   remove obsolete 5-condition/18-slot assumptions.

## Task 2 — sampling plan and data bank

Add the frozen sampling plan, simple pair/case schema, canonical index, and
   eight pair datasets. Keep pair files disjoint so they can be independently
   reviewed.

## Task 3 — audit and projection

Add the mechanical data audit and update Harbor projection to produce 96
   candidate tasks without evaluator material.

## Task 4 — public documentation

Rewrite README, DATA-CARD, benchmark design, terminology, preregistration,
   and validity boundaries for the new bank; remove stale legacy census and
   Coffee Chat comparison language.

## Task 5 — verification and handoff

Run the prescribed checks, inspect the diff, and hand off one PR named
   `data(bench): rebuild the public judgment-history bank`.

## Required verification

```bash
npm run data:audit
npm run format:check
npm run typecheck
npm run check:inactive
npm test
npm run ci:policy
git diff --check
```

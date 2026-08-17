# Implementation plan

Coffee Chat Bench remains `not_active`. This plan keeps the repository useful
as a public benchmark contract without pretending that contract tests are
semantic validity evidence.

## Completed in the dataset PR

The first implementation unit rebuilds the bank instead of extending the old
split structure.

- one `public benchmark bank` with 8 matched target pairs;
- 16 synthetic targets and 8 history records per target;
- 32 held-out case families and 3 conditions per family;
- 96 candidate condition projections;
- 8 domains, 2 forms, 4 transfer types, 2 task modes, and 4 task archetypes;
- candidate-visible case manifests under `bank/public/**`;
- evaluator-only policy and criterion material under `bank/evaluator/**`;
- a frozen `bank/sampling-plan.json` and digest-bound `bank/bank.json`;
- a candidate-neutral Harbor projection with exactly 96 tasks;
- mechanical data audit, contract tests, inactive boundary checks, and
  construction provenance.

The old release slices, qualification families, five-condition design,
judge-specific runtime, and legacy rubric/plan directories are not reused.

## Next implementation unit: provisional AI judge

The next PR consumes the evaluator criterion contract created here. It should
implement only the semantic measurement boundary:

1. a fixed, versioned judge prompt/protocol with model and configuration
   provenance;
2. dimension-specific judgments for policy adherence, policy transfer, task
   performance, evidence grounding, and critical failure;
3. explicit `provisional` evidence state when human criterion evidence is not
   yet available;
4. nonnumeric handling for failure, abstention, disagreement, invalid output,
   unavailable provider, and missing evidence;
5. no product-specific imports and no conversion of judge output into an
   activation or leaderboard claim.

The AI judge is a required measurement instrument because open-ended policy and
utility cannot be fully determined by format or keyword rules. Human criterion
annotation is a later reference for reliability, calibration, and validity; it
does not make the judge optional in the meantime.

## Later evidence units

After the provisional judge exists:

- run agent candidates through `coffee-chat-eval` using isolated Harbor hosts;
- preserve candidate, harness, model, host, trial, cleanup, and failure
  provenance;
- collect blinded human criterion labels when resources permit;
- compare judge decisions with the human criterion by dimension and form;
- assess reliability, calibration, disagreement, abstention, perturbation, and
  contamination exposure;
- narrow or revise the construct if the falsifiers fail;
- run an activation audit only over evidence that actually exists.

No human annotation, judge agreement, or Harbor structural reward is silently
promoted to an official benchmark score. The repository remains `not_active`
until its activation boundary is independently satisfied.

## Required checks

```bash
npm run data:audit
npm run format:check
npm run typecheck
npm run check:inactive
npm test
npm run ci:policy
git diff --check
```

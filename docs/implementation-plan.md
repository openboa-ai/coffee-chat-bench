# Implementation plan

Coffee Chat Bench remains `not_active`. The current implementation is
deliberately centered on a high-quality public input bank; it does not pretend
that structural tests are semantic validity evidence.

## Input-bank work completed here

The public input bank is one canonical dataset with:

- 8 matched target pairs and 16 synthetic targets;
- eight history records per target;
- 32 separately authored multi-document case families;
- three render conditions per case and 96 agent-condition projections;
- eight domains, four transfer types, two forms, two task modes, and four task
  archetypes;
- five coherent documents per case, including current evidence, constraints,
  competing interpretation or proposal, context, and natural irrelevant material;
- human-audit annotations under `bank/annotations/`, excluded from candidate
  rendering; and
- no evaluator-only `bank/evaluator/` directory, no answer labels, and no
  active score.

The old split structure and hidden evaluator material are not reused. Public
cases are self-contained because the input itself must express the problem; the
judge must not receive a separate answer card as part of candidate evaluation.

## Why the next unit is separate

The next unit may create candidate-output variants and labels only after this
public input bank is accepted and frozen. It must not rewrite a case because a
judge result is inconvenient. Reference labels are sidecar evidence for the
judge study, not public candidate input and not benchmark cases.

The current implementation provides the provisional AI judge as a required
semantic measurement instrument. It accepts an external `CandidateSubmission`
through a provider-neutral transport, validates the final artifact and stated
decision record, performs dimension-specific pointwise calls, and performs four
mirrored pairwise comparisons. It preserves explicit evidence states and does
not manufacture an overall transfer verdict. Human criterion annotation later
supplies reliability and calibration evidence; it does not make the AI judge
optional.

## Later evaluation work

After the judge contract is ready:

- `coffee-chat-eval` runs agent candidates through isolated Harbor hosts;
- adapters convert agent results into the public input/submission contract;
- receipts preserve candidate, harness, model, host, trial, cleanup, and
  failure provenance;
- `coffee-chat-bench` evaluates judgment alignment, stated-rationale alignment,
  task performance, evidence grounding, hard-constraint violations, and
  mirrored pairwise contrasts through its provider-independent evaluator; and
- reports preserve missing, invalid, unavailable, skipped, abstained, and
  judge-disagreement states as nonnumeric.

No judge result, structural reward, or project-side review is silently promoted
to an active benchmark score. Activation remains a separate validity decision.

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

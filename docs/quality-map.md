# Coffee Chat Bench quality map

## Status

The repository is `not_active`. Current checks cover contract consistency,
public-bank construction, Harbor projection, provenance, and the inactive
boundary. They do not establish semantic validity, human-grounded judge
qualification, candidate performance, or activation.

## Quality surfaces

| Objective                   | Observable acceptance criterion                                                                    | Evidence tier                 | Gate                    |
| --------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------- |
| Candidate independence      | No candidate, product, provider, or credential import                                              | contract/integration boundary | inactive check + tests  |
| Fixed public bank           | 8 pairs, 16 targets, 32 cases, 3 conditions, 96 projections                                        | contract                      | `data:audit`            |
| Matched histories           | Same record IDs, formats, evidence references, and ≤10% length difference for A/B                  | construction contract         | `data:audit`            |
| Policy/evaluator separation | Rendered input contains only one selected history; hidden policy and criterion stay evaluator-only | behavior/acceptance           | render + Harbor tests   |
| Case diversity              | Domain, form, transfer, task mode, and archetype cells match the sampling plan                     | contract                      | `data:audit`            |
| Objective artifact contract | Byte limit, UTF-8, BOM, and required references are enforced                                       | contract/behavior             | artifact tests          |
| Harbor projection           | Exactly 96 unique no-network tasks with structural verifier parity                                 | integration boundary          | Harbor projection tests |
| Semantic measurement        | AI judge consumes the criterion contract and preserves explicit nonnumeric states                  | evaluation                    | next PR                 |
| Human criterion             | Blinded human references support judge reliability and calibration                                 | validity                      | future study            |
| Activation                  | Required validity evidence is present and scope-limited                                            | benchmark                     | future audit            |

## Ownership

- `coffee-chat-bench` owns cases, evaluator material, rendering, objective
  contracts, and validity plans.
- `coffee-chat-eval` owns adapters, provider/model/host execution, isolation,
  receipts, and performance reports.
- Product implementation tests do not award benchmark value or semantic policy
  credit.

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

No passing gate changes the repository status. See
[benchmark design](benchmark-design.md) and the
[validity evidence plan](validity/validity-argument-and-evidence-plan.md) for
claims these checks cannot support.

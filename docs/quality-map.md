# Coffee Chat Bench quality map

## Status

The repository is `not_active`. Current checks cover public-input contract
consistency, document-bundle construction, Harbor projection, provenance, and
the inactive boundary. They do not establish semantic validity, human-grounded
judge qualification, candidate performance, or activation.

## Quality surfaces

| Objective                     | Observable acceptance criterion                                                               | Evidence tier         | Gate                       |
| ----------------------------- | --------------------------------------------------------------------------------------------- | --------------------- | -------------------------- |
| Candidate independence        | No product, provider, credential, or candidate import                                         | contract/integration  | inactive checks + tests    |
| One public bank               | 8 pairs, 16 targets, 32 cases, 3 conditions, 96 projections                                   | construction contract | `data:audit`               |
| Self-contained inputs         | Every case has task, constraints, deliverables, 5 documents, and source binding               | contract              | `data:audit`               |
| Realistic document context    | Each case has sufficient evidence, a natural distractor, and coherent constraints             | construction review   | direct review              |
| Matched histories             | Same IDs, formats, facts, and <=10% A/B length/token difference                               | construction contract | `data:audit`               |
| Candidate boundary            | Renderer exposes documents plus exactly one selected history and no annotations               | behavior/acceptance   | render + Harbor tests      |
| Objective submission contract | Artifact bytes/references and stated-decision-record shape/source visibility are enforced     | contract/behavior     | artifact + evaluator tests |
| Harbor projection             | Exactly 96 unique no-network tasks emit artifact plus decision record with verifier parity    | integration boundary  | Harbor tests               |
| Pointwise measurement         | Dimension-specific calls isolate judgment, stated rationale, task, grounding, and constraints | evaluation            | evaluator scenarios        |
| Pairwise measurement          | Four comparisons run in canonical and mirrored order; disagreement stays nonnumeric           | evaluation            | evaluator scenarios        |
| Human criterion               | Blinded human references support judge reliability and calibration                            | validity              | future study               |
| Activation                    | Required validity evidence exists and scope is explicit                                       | benchmark             | future audit               |

## Ownership

- `coffee-chat-bench` owns public cases, human-audit construction sidecars,
  rendering, objective contracts, and validity plans.
- `coffee-chat-eval` owns adapters, agent/model/host execution, isolation,
  receipts, Judge transport configuration, and performance reports.
- `coffee-chat-bench` owns the provider-neutral Judge protocol, semantic
  evaluation orchestration, parsing, and benchmark validity evidence.
- Product implementation tests do not award benchmark value or semantic
  judgment-alignment credit.

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

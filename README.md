# Coffee Chat Bench

Coffee Chat Bench is a candidate-independent benchmark runtime for fixed
synthetic judgment-policy application in agents.

## Status

Repository status: `not_active`.

The repository now has compact offline contracts, a complete public synthetic
bank, a candidate-neutral Harbor task projection, and a fixed blind
judge-qualification package. Eval has completed two installed-Harbor Oracle
controls and 48 isolated Codex candidate trials across the 12 scored
release/form families under task-only and one diagnostic condition. Those
receipts are structural execution evidence only: no semantic candidate result,
independently reviewed human labels, qualified judge evidence, leaderboard, or
activation decision exists. Passing code checks and execution controls
establish implementation behavior and file consistency only; they do not
establish benchmark validity, authentic-human transfer, population validity,
or product performance.

## Research question and bounded claim

Given the same fixed synthetic evidence packet and task, does a declared
synthetic target policy cause a candidate system to produce target-specific
work while preserving task utility and integrity?

The initial claim is bounded to the fixed public synthetic bank. It does not
claim to represent a person, transfer authentic human judgment, or generalize
to an unseen population. Dialogue responses and professional task artifacts
are separate forms and are never silently pooled.

The scored candidate is neutral to implementation kind: model, harness,
adaptation/context mechanism, tool policy, and configuration are recorded as
observable provenance. Coffee Chat Product internals, commands, types, and
private state cannot earn credit.

## Current runtime and projection

The candidate-result path has five contracts and six offline operations:

```text
CaseManifest + RunReceipt + JudgmentRecord + BenchmarkReport
validate-bank -> render-case -> validate-output -> judge -> report
```

The separate qualification path projects six blinded human-annotation groups,
preserves unanimous/ambiguous/missing references, and derives qualification for
the two frozen primary judges plus one cross-validation judge. It performs no
provider call and cannot create human evidence. A runtime judge configuration is
derived only from a qualified report and digest-binds the release, judge
protocol, study, model, and exact model-evidence record; evidence from another
protocol or study is rejected.

Each case family uses exactly five conditions:

- `task_only`
- `nondiagnostic_target_a`
- `nondiagnostic_target_b`
- `diagnostic_target_a`
- `diagnostic_target_b`

The sealed per-case judgment plan declares every pointwise and pairwise slot:
its stable judgment ID, optional pair ID, dimension, orientation, ordered
conditions, rubric projection, and expected verdict. Pairwise raw slots are
canonical/mirrored diagnostics; the report collapses them by semantic artifact
before comparing the declared expectation.

Task-utility comparisons use non-inferiority: diagnostic context may improve or
tie the task-only output, but it cannot pass by making the work less useful.
Utility improvement remains a direction-free effect estimate rather than a
predeclared correct answer.

The two frozen primary judges, Terra and Luna, must agree and the independent
cross-validation judge, Sol, must match their verdict for a numeric model
judgment. Sol never adjudicates primary disagreement. Missing,
invalid, unavailable, failed, abstained, disagreeing, leaked, or cleanup-failed
evidence remains explicit and nonnumeric.

Reports keep every form and release wave separate. `release_a` is the primary
slice; public `release_b` is a second fixed robustness slice, not an untouched
or independent replication. QPCFR is nonnumeric unless the complete family and
all fixed score dimensions are declared and measured.

The Harbor projector materializes the 16-family × five-condition census as 80
digest-named, no-network tasks. Each task explicitly requests Harbor's
`[verifier] environment_mode = "separate"`, so the verifier runs in a fresh
container rather than the candidate environment. Its Oracle and verifier prove
only output-file plumbing and objective conformance. Their `1`/`0` reward is not
semantic credit, a candidate result, or activation evidence. The task image is
digest-pinned and includes the shell required by Harbor 0.21's script runner.

## Ownership boundary

Bench owns the candidate-neutral bank contract, Harbor task projection,
rendering, objective artifact validation, sealed judgment-plan parsing,
provider-independent judge I/O, and derived report accounting. It exposes only
`JudgeTransport` for external model calls.

Eval owns candidate and harness adapters, concrete provider transports and
credentials, Harbor execution, host isolation evidence, and candidate-facing
reports. This repository implements no live provider call, candidate adapter,
or Coffee Chat Product integration.

## Repository map

| Path                            | Purpose                                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| `bank/`                         | Public synthetic cases and evaluator-only rubrics and plans           |
| `harbor/`                       | Candidate-neutral task projection and structural verifier             |
| `qualification/`                | Blind human-reference and three-model judge qualification package     |
| `src/`                          | Candidate-result, activation, and qualification evidence contracts    |
| `schemas/benchmark.schema.json` | Public JSON Schema authority                                          |
| `tests/`                        | Contract, scenario, schema, CLI, policy, and inactive-boundary checks |
| `docs/benchmark-design.md`      | Current construct and runtime authority                               |
| `docs/implementation-plan.md`   | Completed projection boundary and remaining evidence units            |
| `docs/validity/`                | Citation-backed prospective validity and related-work boundaries      |
| `DATA-CARD.md`                  | Bank census, rights, limitations, and missing evidence                |
| `PREREGISTRATION.md`            | Frozen contrasts, analysis boundary, and falsifiers                   |

## Commands

```bash
npm run typecheck
npm test
npm run check:inactive
npm run ci:policy
npm run format:check
git diff --check

# qualification evidence audit (offline; no provider call)
node --experimental-strip-types src/cli.ts qualification \
  --study qualification/study.json \
  --bank bank \
  --annotations /path/to/human-annotations.json \
  --votes /path/to/judge-votes.json

# export one blinded human-annotation packet (offline; no provider call)
node --experimental-strip-types src/cli.ts qualification-packet \
  --study qualification/study.json \
  --bank bank \
  --group group-01 > /path/to/group-01-packet.json

# activation evidence audit (offline; does not activate the repository)
node --experimental-strip-types src/cli.ts activation-audit \
  --bank bank \
  --evidence docs/validity/activation-evidence.json
```

The formatter covers every bank JSON file. JSONL evidence ledgers are validated
as scenario inputs rather than rewritten into a different record format.

## Before activation

Activation requires all of the following, beyond passing implementation checks:

1. Independent human semantic and provenance review of the licensed public bank,
   sealed author-hypothesis plans, preregistration, and controls.
2. Independently blinded human labels plus qualification and reliability evidence
   for the frozen judge configuration and each scored form/dimension.
3. Eval-owned candidate execution with isolated Harbor evidence, exact receipts,
   cleanup, fresh-session, and leakage evidence.
4. A written activation audit that reports coverage, uncertainty, failures, and
   the limited claim actually supported.

See [benchmark design](docs/benchmark-design.md), the
[implementation plan](docs/implementation-plan.md), the
[validity argument](docs/validity/validity-argument-and-evidence-plan.md), and
[related work](docs/validity/related-work-and-discriminant-validity.md). The
frozen annotation procedure is in
[the qualification protocol](qualification/PROTOCOL.md).

## Security and license

Repository software and reusable documentation are MIT licensed. Future bank
material requires an explicit redistribution basis before admission. Report
vulnerabilities as described in [SECURITY.md](SECURITY.md).

# Coffee Chat Bench quality map

## Status

The repository is `not_active`. Current checks establish compact contract,
public-bank, Harbor-projection, accounting, security, and no-claim behavior.
They do not establish semantic validity, completed human-grounded judge
qualification, candidate performance, or activation. Eval has separately
executed a two-condition installed-Harbor Oracle control.

## Current quality surfaces

| Objective                      | Evidence and failure boundary                                                                                                                    | Gate                          | Status                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ----------------------------------------------------------- |
| Candidate independence         | No Product imports or Product-specific credit; candidate identity is observable provenance only                                                  | `npm test`, inactive check    | implemented                                                 |
| Exact bank admission           | Exact 16-family census, sealed files, five conditions, split lineage, rights, and declared judgment slots                                        | public-bank scenarios         | implemented public synthetic bank                           |
| Candidate/sealed separation    | Rendering projects one candidate-visible condition; sealed rubric/plans stay outside candidate input                                             | render and schema scenarios   | implemented                                                 |
| Harbor projection              | Exact 80-task census, digest binding, no-network task shape, no sealed metadata, and structural verifier parity                                  | Harbor projection scenarios   | implemented; installed Oracle control executed              |
| Objective artifact validation  | Byte, media, citation, and output-contract checks; no semantic score from deterministic rules                                                    | artifact scenarios            | implemented                                                 |
| Isolation evidence             | Receipt records session, order, leakage, execution, cleanup, and artifact validation                                                             | receipt/report scenarios      | implemented contract; Eval evidence not collected           |
| Judge binding                  | Exact slot, rubric projection, task/evidence, receipt/artifact, two frozen primary judges plus Sol cross-validation, and treatment-blind payload | judge/report scenarios        | implemented contract; qualification not run                 |
| Nonnumeric accounting          | Missing, invalid, unavailable, failure, abstention, disagreement, leakage, and cleanup failure remain explicit                                   | report scenarios              | implemented                                                 |
| Form/release reporting         | Dialogue and professional forms separate; release A/B separate; QPCFR requires complete declared evidence                                        | report scenarios              | implemented contract; no measured release                   |
| Security and inactive boundary | Protected policy, no provider/candidate adapter, and no activation/result claim                                                                  | `ci:policy`, `check:inactive` | implemented                                                 |
| Validity and activation        | Bank design, human labels, judge qualification, reliability, controls, explicit gate states, and written activation audit                        | audit/manual evidence         | audit contract implemented; required evidence not collected |

## Required verification

```bash
npm run typecheck
npm test
npm run check:inactive
npm run ci:policy
npm run format:check
git diff --check
```

Passing these checks does not change repository status. See
[benchmark design](benchmark-design.md) and the
[validity argument](validity/validity-argument-and-evidence-plan.md) for the
evidence gates they cannot satisfy.

# Validity argument and evidence plan

## Status and claim boundary

Coffee Chat Bench is `not_active`. The repository now contains a fixed public
synthetic bank and author-hypothesis judgment plans, but no independent human
semantic review, human labels, qualification evidence, measured result, or
activation decision. Implementation tests do not validate the construct or
activate the repository.

The only proposed initial interpretation is: on declared fixed synthetic tasks,
a candidate applied the declared synthetic target policy in the preregistered
direction while preserving stated utility and integrity gates. This does not
claim authentic-human judgment transfer, a complete person model, population
validity, Product superiority, or an unseen-task generalization.

Task utility is a guardrail, not a presumed benefit: diagnostic context must be
non-inferior to task-only work and pass an absolute floor. Improvement, tie, and
degradation remain separately observable rather than encoding uplift as the
correct answer.

The distinction between score interpretation and use follows the
[Standards for Educational and Psychological Testing](https://www.testingstandards.net/uploads/7/6/6/4/76643089/standards_2014edition.pdf),
[Messick](https://doi.org/10.1037/0003-066X.50.9.741), and
[Kane](https://doi.org/10.1111/jedm.12000). This is a prospective evidence
argument, not evidence that the instrument is valid.

## Required evidence

| Inference                     | Required future evidence                                                                                                                                                                                                                                                                                                   | Falsifier or limiting outcome                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Content and construct         | Public case bank, source/provenance review, synthetic target-policy rationale, five-condition controls, and preregistration                                                                                                                                                                                                | Cases reduce to generic context, style, retrieval, or explicit-rule following         |
| Scoring                       | Blinded human labels, ambiguity/abstention records, sealed rubrics, and objective artifact checks                                                                                                                                                                                                                          | Labels or rubric use are not stable enough to define the declared policy              |
| Judge use                     | Disjoint qualification material, per-form/dimension calibration, [reliability analysis protocol](../../qualification/RELIABILITY.md), perturbation and bias tests for both frozen primary judges and the Sol cross-validation judge, plus a source-generator overlap control for the Sol-generated qualification artifacts | Any configured judge does not reproduce qualified human labels or fails bias controls |
| Internal structure            | Separate form/dimension reporting, missingness, and non-compensatory QPCFR evidence                                                                                                                                                                                                                                        | One generic quality factor or pooling explains the apparent result                    |
| Controls and discrimination   | A/B cross-scoring, target-matched nondiagnostic controls, task-only controls, lexical/style/retrieval falsifiers, and the named prompt-injection canary                                                                                                                                                                    | Controls reproduce the result or declared contrasts fail                              |
| Execution and reproducibility | Eval-owned Harbor isolation, exact receipts, five fresh sessions, cleanup/leakage evidence, and reproducible report inputs                                                                                                                                                                                                 | Output, session, host, or artifact evidence is incomplete or invalid                  |
| Claim and use                 | Written audit of coverage, uncertainty, failures, and the exact supported scope                                                                                                                                                                                                                                            | Evidence supports only a narrower fixed-case statement or no claim                    |

Future evidence must preserve explicit missing, invalid, unavailable, failure,
abstention, disagreement, and leakage states. They cannot become zero, success,
or silent exclusion.

The named embedded-instruction case is a fixed canary. Its result cannot support
a general prompt-injection robustness claim.

## Release and judge interpretation

`release_a` is the primary fixed synthetic slice. `release_b` is a public
fixed robustness slice, not untouched or independent replication. Dialogue and
professional forms remain separate strata.

The two frozen primary judges, Terra and Luna, must agree and the independent
cross-validation judge, Sol, must match their verdict before a numeric model
judgment. Sol never adjudicates primary disagreement. Model agreement is not
human criterion validity; independently blinded human labels and qualification
for Terra, Luna, and Sol remain required before any official score
interpretation.

## Activation gate

Activation requires a licensed public bank; completed controls and
preregistration; independently blinded human labels; qualified evidence for all
three configured judges; Eval execution receipts with isolation, cleanup, order,
and leakage evidence; complete release/form coverage; and a written audit. The
audit must preserve the limited fixed-synthetic claim and leave the repository
`not_active` if any gate is absent. Missing, partial, failed, unavailable, and
inconclusive gates are represented explicitly by the activation-audit contract.

Benchmark lifecycle and reporting discipline are informed by
[BetterBench](https://proceedings.neurips.cc/paper_files/paper/2024/hash/26889e8359e7ef8a7f5d77457364ca55-Abstract-Datasets_and_Benchmarks_Track.html).
LLM-judge calibration must be evaluated as measurement, not assumed from model
agreement; relevant evidence includes
[G-Eval](https://aclanthology.org/2023.emnlp-main.153/),
[MT-Bench](https://proceedings.neurips.cc/paper_files/paper/2023/hash/91f18a1287b398d378ef22505bf41832-Abstract-Datasets_and_Benchmarks_Track.html),
and [JudgeBench](https://openreview.net/forum?id=G0dksFayVq).

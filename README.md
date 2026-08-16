# Coffee Chat Bench

Coffee Chat Bench is a candidate-independent benchmark for **agent systems**.
It evaluates whether an agent's decision behavior changes in response to a
declared, case-specific decision policy while preserving task utility, evidence
grounding, and critical constraints.

The repository name identifies the project. Coffee Chat is not the candidate,
comparison baseline, or scoring target, and the benchmark does not import
Coffee Chat internals.

## What problem does it evaluate?

The same task and evidence can support different defensible decisions when a
different decision policy is relevant. Generic task success alone does not
show whether an agent applied that policy, whether the context changed the
decision for the right reason, or whether the output remained useful and
grounded in the supplied evidence.

This benchmark therefore compares matched conditions for the same task:

1. task-only input;
2. exposure-matched context that is not diagnostic of policy A or B; and
3. context that is diagnostic of policy A or B.

The benchmark's operational construct is called **context-conditioned decision
behavior**. This is a project-specific operational label, not a claim that
the phrase is an established name for a new research construct. At the case
level, the observable question is whether the agent adheres to the declared
decision policy under the diagnostic context without sacrificing task utility
or evidence grounding.

## Research terminology and scope

The surrounding research uses several related terms. They are related, but
they are not interchangeable and none should be silently treated as the
construct measured by this bank.

| Research term                    | Meaning in the literature                                                                   | Boundary in this benchmark                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `personalization`                | Adapting model outputs to information about a user or profile                               | The bank uses synthetic policy contexts; it does not claim to model an authentic person                           |
| `personalized alignment`         | Adapting behavior to individual preferences while retaining broader human-value constraints | An adjacent research framing, not a validity claim for this synthetic bank                                        |
| `profile-conditioned generation` | Conditioning generation on a user profile or personal history                               | The matched contexts are controlled inputs, not a live profile-inference task                                     |
| `preference alignment`           | Measuring or optimizing agreement between an output and specified preferences               | The semantic judge uses policy-alignment judgments, but the bank does not claim to recover real human preferences |
| `dynamic preference inference`   | Inferring unspoken preferences through interaction and then adapting behavior               | Out of scope; the policy contrast is declared in each synthetic case                                              |
| `persona`                        | A represented or assigned person-like condition used by some personalization studies        | Related-work vocabulary only; it is not a product identity or benchmark construct here                            |

The terminology map and source boundaries are documented in
[Terminology and construct map](docs/terminology.md). The broader research
comparison is in [Related work](docs/validity/related-work-and-discriminant-validity.md).

## Who or what is evaluated?

The candidate is an **agent system**: an agent runtime or harness, configured
model, host, adaptation, and tool policy. The public contract requires
`candidateKind: "agent"` and records these components as provenance.

A direct one-shot language-model completion is outside the candidate scope.
The model calls used by the AI judge are evaluator measurements, not candidate
systems.

The benchmark is designed for agent execution through an adapter and isolated
host. `coffee-chat-eval` owns provider credentials, candidate adapters, Harbor
execution, host isolation, and candidate-facing reports. This repository owns
the candidate-independent bank, rendering contract, objective artifact
validation, semantic judge interface, and report derivation.

## What is one benchmark case?

Each scored family contains one task, one evidence packet, one output contract,
and five candidate-visible conditions:

| Condition                | Candidate-visible meaning                          |
| ------------------------ | -------------------------------------------------- |
| `task_only`              | The task without target context                    |
| `nondiagnostic_target_a` | Exposure-matched context without policy-A evidence |
| `nondiagnostic_target_b` | Exposure-matched context without policy-B evidence |
| `diagnostic_target_a`    | Context expressing policy A for this case          |
| `diagnostic_target_b`    | Context expressing policy B for this case          |

The candidate sees only one selected condition. Target identity, expected
direction, sealed rubric projections, judgment plans, and the other conditions
are evaluator-only material. Because the bank is public, this is execution
separation rather than a permanent secrecy or contamination claim.

## What is measured?

The benchmark separates semantic evaluation from objective verification:

| Measurement        | Operational question                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| Policy alignment   | Does the output reflect the declared case-specific decision policy?                                         |
| Policy specificity | Does the change appear under the diagnostic policy context rather than under matched nondiagnostic context? |
| Task utility       | Is diagnostic-context performance non-inferior to task-only performance, subject to the declared floor?     |
| Evidence grounding | Does the output preserve required evidence references, factual support, and declared constraints?           |
| Critical failure   | Does the output avoid a case-defined failure that invalidates an otherwise plausible answer?                |

Objective checks validate bytes, encoding, required references, and output
contracts. The AI judge, or **LLM-as-a-judge**, evaluates the open-ended
semantic dimensions. The serialized contract retains the field
`evidence_integrity` for the evidence-grounding dimension. It is not a claim
that a lexical overlap score proves grounding or policy alignment.

## Current public bank

The external surface is one `public benchmark bank`:

| Item                         | Current state                                                     |
| ---------------------------- | ----------------------------------------------------------------- |
| Scored families              | 12                                                                |
| Candidate conditions         | 60, five per scored family                                        |
| Policy blocks                | 3                                                                 |
| Output forms                 | Dialogue and professional artifact                                |
| Reporting strata             | `release_a` and `release_b`, internal partitions of the same bank |
| Judge-qualification families | 4, excluded from candidate scoring                                |
| Data status                  | Synthetic, public, prospective                                    |

The bank is construction material and has not established transfer to
authentic human judgment, population validity, unseen-task generalization, or
agent performance. Dataset expansion and case-quality review are managed as a
separate data PR; the counts above describe the current checkout.

## AI-judge evidence states

The AI judge is required for semantic evaluation. Human annotation is not a
precondition for running it; human criterion evidence determines how strongly
its results may be interpreted.

| State         | Meaning                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provisional` | The fixed judge protocol can produce development measurements for internal hill climbing. Human-grounded reliability and calibration are still unverified. |
| `qualified`   | Blinded human criterion evidence, reliability, calibration, and bias/perturbation checks support the judge for the declared scope.                         |

Both states remain `not_active` until the complete activation evidence exists.
Provisional measurements are not human-validated public scores. Judge failure,
invalid response, unavailable provider, abstention, disagreement, or missing
evidence remains explicit and nonnumeric; it is never converted to zero or
success.

## Status and claims

Repository status: `not_active`.

Passing repository tests proves contract consistency, not construct validity,
criterion validity, judge qualification, candidate utility, or benchmark
activation. This document does not establish benchmark validity, authentic-human
transfer, population validity, or product performance. The benchmark does not
currently provide a leaderboard, measured public result, authentic-person
judgment, or Coffee Chat product score.

## Execution boundary

```text
validate-bank -> render-case -> agent adapter -> isolated agent run
                                      -> objective verifier
                                      -> AI judge -> report
```

The benchmark package does not contain provider credentials, candidate
adapters, or Coffee Chat-specific execution code.

## Commands

```bash
npm run typecheck
npm test
npm run check:inactive
npm run ci:policy
npm run format:check
git diff --check
```

These commands verify contracts, repository boundaries, and the inactive
claim boundary. They do not activate the benchmark.

## Further reading

- [Data card](DATA-CARD.md) — bank census, provenance, limitations, and open evidence
- [Terminology and construct map](docs/terminology.md) — research terms and project mappings
- [Benchmark design](docs/benchmark-design.md) — conditions, contracts, and measurement layers
- [Preregistration](PREREGISTRATION.md) — fixed contrasts and falsifiers
- [Validity argument](docs/validity/validity-argument-and-evidence-plan.md) — construct, criterion, and activation evidence
- [Related work](docs/validity/related-work-and-discriminant-validity.md) — adjacent research and discriminant boundaries
- [Lexical-surface control](docs/validity/lexical-surface-control.md) — case leakage falsifier
- [Judge qualification package](qualification/README.md) — future human criterion and calibration procedure

## Selected research references

- [Guan et al., _A Survey on Personalized Alignment_ (Findings of ACL 2025)](https://aclanthology.org/2025.findings-acl.277/)
- [Salemi et al., _LaMP: When Large Language Models Meet Personalization_ (ACL 2024)](https://aclanthology.org/2024.acl-long.399/)
- [Wang et al., _Learning Personalized Alignment for Evaluating Open-ended Text Generation_ (EMNLP 2024)](https://aclanthology.org/2024.emnlp-main.737/)
- [Wu et al., _Aligning LLMs with Individual Preferences via Interaction_ (COLING 2025)](https://aclanthology.org/2025.coling-main.511/)
- [Liu et al., _AgentBench: Evaluating LLMs as Agents_ (ICLR 2024)](https://arxiv.org/abs/2308.03688)
- [Terminal-Bench](https://www.tbench.ai/) and [Harbor task structure](https://www.harborframework.com/docs/tasks) — agent task, environment, and verifier separation

## License

Repository software and reusable documentation are MIT licensed. Future bank
material requires an explicit redistribution basis before admission. Report
vulnerabilities as described in [SECURITY.md](SECURITY.md).

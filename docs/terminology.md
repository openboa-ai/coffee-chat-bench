# Terminology and construct map

## Status and purpose

Coffee Chat Bench remains `not_active`. This document prevents research terms
from being used as loose synonyms and separates established terminology from
the benchmark's own operational labels.

## Core distinction

The benchmark studies a controlled, synthetic case in which a task and its
evidence are held fixed while the supplied decision-policy context changes.
The repository calls the resulting operational construct **context-conditioned
decision behavior**. This is a local operational label, not a claim that the
phrase is an established field-wide construct.

The case-level observable is **adherence to a declared decision policy**. The
benchmark asks whether the agent changes its decision under diagnostic context,
does not change in matched nondiagnostic conditions, and preserves task utility
and evidence grounding. It does not infer a real person's identity, recover
unspoken preferences, or measure a global personality trait.

## Research terms and the Bench mapping

| Term                             | Standard research use                                                                             | Relation to this Bench                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `personalization`                | Adapting a model's output to information about a user, profile, or history                        | Broad adjacent area; the synthetic bank is not evidence of authentic-user personalization                                                    |
| `personalized alignment`         | Adapting model behavior to individual preferences while retaining broader human-value constraints | Motivation and related-work framing; not the name of the measured construct                                                                  |
| `profile-conditioned generation` | Generating outputs conditioned on a profile or personal items                                     | Relevant precedent for context-conditioned output, but the Bench uses controlled policy contexts rather than profile retrieval as the target |
| `preference alignment`           | Aligning or evaluating outputs against specified preferences                                      | The semantic alignment dimension is analogous at the case level; no human preference is assumed by the synthetic bank                        |
| `dynamic preference inference`   | Inferring unspoken preferences during interaction and adapting later behavior                     | Explicitly out of scope for the initial bank because the policy contrast is declared in the case                                             |
| `persona`                        | A represented or assigned person-like condition used in some personalization and dialogue work    | Source terminology allowed in related work; not a Bench construct, score, or claim about a real person                                       |
| `policy adherence`               | Following a declared policy or set of task constraints in an environment                          | The closest case-level description of what the diagnostic contrast tests                                                                     |
| `task utility`                   | Whether added context preserves or improves task-relevant performance                             | A guardrail and estimand; this Bench uses non-inferiority against task-only work rather than assuming improvement                            |
| `evidence grounding`             | Supporting an output with supplied evidence and required references                               | The public explanation uses this standard phrase; the serialized contract retains `evidence_integrity`                                       |
| `LLM-as-a-judge`                 | Using a language model as an evaluator of open-ended outputs                                      | The required semantic measurement instrument; its evidence state is provisional or qualified                                                 |
| `human criterion`                | An independently collected human reference used to assess a measurement instrument                | Future evidence for judge qualification, not a prerequisite for provisional execution                                                        |
| `reliability`                    | Consistency of measurements across raters, items, or controlled perturbations                     | Required judge evidence; model agreement alone is not human criterion validity                                                               |
| `calibration`                    | Adjusting or assessing an evaluator against a reference criterion and its uncertainty             | Future judge qualification evidence, reported by form and dimension                                                                          |
| `construct validity`             | Evidence that an instrument measures the intended construct                                       | Not established by repository tests or a provisional score                                                                                   |
| `discriminant validity`          | Evidence that the instrument is distinct from nearby alternative explanations                     | Tested through nondiagnostic controls, lexical-surface controls, and related-work boundaries                                                 |

## Terms used in the case contract

| Contract term           | Meaning here                                                                            | Avoid interpreting it as                                               |
| ----------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `policy A` / `policy B` | Two case-specific, mutually contrasting decision policies                               | Globally better values, personalities, or user types                   |
| `diagnostic context`    | Context that contains evidence for one declared policy in the case                      | Proof that an agent inferred a real person                             |
| `nondiagnostic context` | Exposure-matched context without evidence for the selected policy                       | An empty or low-quality context                                        |
| `target_alignment`      | Serialized field for semantic alignment with the case's declared policy                 | Human preference recovery or universal alignment                       |
| `target_specificity`    | Serialized field for whether the policy-linked change is specific to diagnostic context | Generic quality or style matching                                      |
| `evidence_integrity`    | Serialized field for evidence grounding and critical support constraints                | A lexical overlap score or proof of truth beyond the supplied evidence |
| `critical_failure`      | A case-defined failure that invalidates an otherwise plausible output                   | A universal safety score                                               |
| `family`                | One task/evidence/policy case with five condition executions                            | One independent human or real-world user                               |
| `condition`             | One candidate-visible version of a family                                               | A separate benchmark dataset                                           |
| `qualification family`  | A case used to validate the AI judge against future human criterion                     | A candidate-scoring case                                               |

## Agent-evaluation terms

The candidate class follows the agent-evaluation framing used by
[AgentBench](https://arxiv.org/abs/2308.03688),
[Terminal-Bench](https://www.tbench.ai/), and
[Harbor](https://www.harborframework.com/docs/core-concepts):

- **agent system** — the agent runtime or harness together with its configured
  model, host, tools, adaptation, and execution policy;
- **task** — the instruction and environment contract presented to the agent;
- **execution** — the isolated run that produces a transcript or workspace
  artifact and an inspectable receipt;
- **verifier** — an objective checker of the resulting artifact or environment
  state;
- **AI judge** — the semantic evaluator used when objective verification cannot
  determine policy alignment or open-ended utility;
- **report** — the derived accounting of measured, missing, invalid,
  unavailable, and nonnumeric evidence.

The Bench contract does not admit a direct one-shot language-model completion as
a candidate. A model call made by the AI judge is an evaluator call and must
not be confused with the agent system under evaluation.

## Evidence terms

The benchmark uses the following evidence hierarchy:

1. **Objective verification** — bytes, format, citations, constraints, and
   declared artifact contracts.
2. **AI-judge measurement** — semantic policy alignment, task utility,
   evidence grounding, specificity, and critical failure.
3. **Human criterion** — independently blinded human labels used to assess and
   calibrate the AI judge.
4. **Validity evidence** — construct, criterion, reliability, calibration,
   discriminant, and activation evidence.

`provisional` means the AI judge can run as a development measurement before
human criterion collection. `qualified` means the declared human-grounded
qualification evidence has been met. Neither state activates the repository
by itself.

## Sources

- [Guan et al., _A Survey on Personalized Alignment_ (Findings of ACL 2025)](https://aclanthology.org/2025.findings-acl.277/)
- [Salemi et al., _LaMP: When Large Language Models Meet Personalization_ (ACL 2024)](https://aclanthology.org/2024.acl-long.399/)
- [Wang et al., _Learning Personalized Alignment for Evaluating Open-ended Text Generation_ (EMNLP 2024)](https://aclanthology.org/2024.emnlp-main.737/)
- [Wu et al., _Aligning LLMs with Individual Preferences via Interaction_ (COLING 2025)](https://aclanthology.org/2025.coling-main.511/)
- [Merrill et al., _Terminal-Bench: Benchmarking Agents on Hard, Realistic Tasks in Command Line Interfaces_](https://arxiv.org/abs/2601.11868)
- [Harbor task documentation](https://www.harborframework.com/docs/tasks)

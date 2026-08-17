# Terminology and construct map

## Status and purpose

Coffee Chat Bench remains `not_active`. This document separates established
research terms from local operational labels so the benchmark does not make a
larger claim than its synthetic data supports.

## Construct language

The bank holds a task and evidence packet constant, then supplies one of two
matched synthetic judgment histories or no history. The intended phenomenon is
described operationally as **history-conditioned policy transfer in agent
systems**. The phrase is a design label, not a claim that the benchmark has
established a field-wide psychological construct.

The case-level question is **policy adherence under transfer**: does the agent
use the selected history to guide a held-out decision while preserving task
performance and evidence grounding? The bank does not infer a real person's
identity, recover unspoken preferences, or measure a global personality trait.

## Research terms and their relation to this bank

| Term                             | Common research use                                                              | Boundary in this bank                                                       |
| -------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `personalization`                | Adapting a model output using information about a user, profile, or history      | The bank uses synthetic histories and makes no authentic-user claim         |
| `profile-conditioned generation` | Generating output conditioned on a profile or personal items                     | The bank controls the history input; it does not evaluate profile retrieval |
| `preference alignment`           | Aligning or evaluating output against specified preferences                      | The bank uses case-specific decision policies, not human preference labels  |
| `personalized alignment`         | Adapting behavior to individual preferences while preserving broader constraints | Related framing, not the name of the measured construct                     |
| `policy adherence`               | Following a declared policy or task constraint in an environment                 | The closest case-level description of the diagnostic behavior               |
| `policy transfer`                | Applying a learned or inferred policy to a new state or task                     | The held-out case is the transfer target                                    |
| `task utility`                   | Task-relevant usefulness or performance under a condition                        | A guardrail: history-conditioned work must still complete the task          |
| `evidence grounding`             | Keeping claims supported by supplied evidence                                    | A separate semantic dimension from policy adherence                         |
| `LLM-as-a-judge`                 | Using a language model to evaluate open-ended model output                       | The required future semantic measurement instrument                         |
| `human criterion`                | An independently collected human reference for evaluating an instrument          | Future evidence for judge qualification, not current data                   |
| `reliability`                    | Consistency across raters, items, or controlled repetitions                      | Required evidence for the judge, not established by code tests              |
| `calibration`                    | Aligning or assessing an evaluator against a reference criterion and uncertainty | Future human-grounded judge evidence                                        |
| `construct validity`             | Evidence that an instrument measures the intended construct                      | Not established by the synthetic bank or provisional judge                  |
| `discriminant validity`          | Evidence that the measure differs from nearby explanations                       | Addressed through matched cases, boundary cases, and shortcut checks        |

`persona` may appear in related-work source terminology, but it is not the
construct or a claim about a real person in this benchmark.

## Contract terms

| Contract term           | Meaning here                                                                                     | Do not interpret it as                        |
| ----------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `judgment policy`       | A case-specific rule for prioritizing decision cues, applying a shared veto, and resolving a tie | A personality trait or universal value system |
| `target_a` / `target_b` | Two bookkeeping labels for matched synthetic histories                                           | Globally better or worse targets              |
| `unconditioned`         | Task and evidence without a judgment history                                                     | A low-quality or missing task                 |
| `diagnostic episode`    | A history episode whose decision differentiates the two synthetic policies                       | Proof of a real preference                    |
| `boundary episode`      | An episode where a shared constraint makes both targets converge                                 | Evidence that the policies are identical      |
| `distractor episode`    | An episode that should not identify the policy                                                   | An irrelevant or malformed record             |
| `near_transfer`         | A held-out task close to the history's decision structure                                        | Mere wording repetition                       |
| `far_transfer`          | A held-out task with a more distant domain or decision surface                                   | Generalization to all tasks                   |
| `boundary`              | A held-out case that tests whether the policy respects a constraint boundary                     | A universal safety benchmark                  |
| `policy_conflict`       | A held-out case where policy-relevant priorities pull in different directions                    | A globally correct answer key                 |
| `evidence_integrity`    | Serialized contract name for grounding and critical evidence constraints                         | A lexical overlap score or truth guarantee    |
| `critical_failure`      | A case-defined failure that invalidates an otherwise plausible output                            | A universal safety score                      |
| `case family`           | One task/evidence packet with two target histories and three rendered conditions                 | One real user or independent human            |
| `public benchmark bank` | The single externally selectable dataset                                                         | A hidden holdout or a qualified score         |

## Agent-evaluation terms

The candidate framing follows agent-evaluation work such as
[AgentBench](https://arxiv.org/abs/2308.03688),
[Terminal-Bench](https://www.tbench.ai/), and
[Harbor](https://www.harborframework.com/docs/core-concepts):

- **agent system** — runtime or harness plus configured model, host, tools,
  adaptation, and execution policy;
- **task** — instruction and environment contract presented to the agent;
- **execution** — an isolated run producing a transcript or workspace artifact
  with an inspectable receipt;
- **adapter** — the evaluator-owned bridge from a candidate agent system to the
  benchmark input/output contract;
- **verifier** — an objective checker of artifact or environment state;
- **AI judge** — a semantic evaluator for dimensions objective verification
  cannot determine;
- **human criterion** — an independent reference used to qualify the AI judge;
- **report** — accounting that preserves measured, missing, invalid,
  unavailable, skipped, and nonnumeric states.

A model call made by the AI judge is an evaluator call. It is not a candidate
agent and must not be confused with one-shot model evaluation.

## Evidence states

1. **Objective verification** — bytes, format, references, constraints, and
   provenance.
2. **AI-judge measurement** — semantic policy adherence, transfer, utility,
   grounding, and critical failure.
3. **Human criterion** — blinded human labels used to assess the judge.
4. **Validity evidence** — construct, criterion, reliability, calibration,
   discriminant, and activation evidence.

`provisional` means the fixed AI-judge protocol can run for development while
human criterion evidence is incomplete. `qualified` means the declared
human-grounded requirements have been met for a stated scope. Neither state
activates the repository by itself.

## Sources

- [Guan et al., A Survey on Personalized Alignment (Findings of ACL 2025)](https://aclanthology.org/2025.findings-acl.277/)
- [Salemi et al., LaMP: When Large Language Models Meet Personalization (ACL 2024)](https://aclanthology.org/2024.acl-long.399/)
- [Wang et al., Learning Personalized Alignment for Evaluating Open-ended Text Generation (EMNLP 2024)](https://aclanthology.org/2024.emnlp-main.737/)
- [Wu et al., Aligning LLMs with Individual Preferences via Interaction (COLING 2025)](https://aclanthology.org/2025.coling-main.511/)
- [Liu et al., AgentBench: Evaluating LLMs as Agents (ICLR 2024)](https://arxiv.org/abs/2308.03688)
- [Terminal-Bench](https://www.tbench.ai/) and [Harbor task documentation](https://www.harborframework.com/docs/tasks)

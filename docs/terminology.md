# Terminology and construct map

## Purpose

Coffee Chat Bench remains `not_active`. This map distinguishes established
research language from repository contract names. Local operational terms are
defined explicitly rather than presented as accepted psychological constructs.

## Construct hierarchy

| Level                 | Term                                    | Meaning in this repository                                                                                     |
| --------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Research area         | `personalized alignment`                | Adapting model behavior to individual preferences, histories, or feedback while retaining broader constraints  |
| Experimental paradigm | `history-conditioned agent evaluation`  | Holding task/evidence fixed while varying which prior decision history an agent receives                       |
| Operational estimand  | `target-conditioned judgment alignment` | The history-conditioned change in held-out judgment, target discrimination, and retained task/evidence quality |
| Observable behavior   | `judgment alignment`                    | Final-artifact consistency with the context-dependent pattern expressed in one target history                  |

`Target-conditioned judgment alignment` is a repository-defined operational
estimand assembled from standard concepts. It is not claimed as a field-wide
construct, personality measure, or model of a whole person.

## Research terms

| Term                             | Common use                                                               | Boundary here                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `personalization`                | Adapting output using user, profile, interaction, or history information | Targets and histories are synthetic; no authentic-user claim                                           |
| `profile-conditioned generation` | Generating with profile or historical items as context                   | History is supplied directly; profile retrieval is not measured                                        |
| `preference alignment`           | Aligning behavior or output to specified or inferred preferences         | This bank observes context-dependent judgments, not global preference labels                           |
| `personalized alignment`         | Individualized alignment under broader constraints                       | Research area, not the score name                                                                      |
| `judgment policy`                | An operational mapping from decision cues and constraints to judgments   | Inferred only within the sampled synthetic histories and tasks                                         |
| `policy transfer`                | Applying an inferred policy in a new state or task                       | A case-design property; the reported outcome is judgment alignment, not a thresholded transfer verdict |
| `task performance`               | Degree to which requested work is successfully completed                 | Separate ordinal guardrail                                                                             |
| `evidence grounding`             | Degree to which claims and actions are supported by supplied evidence    | Separate ordinal guardrail, not citation counting                                                      |
| `LLM-as-a-judge`                 | Language model used to assess open-ended outputs                         | Required semantic measurement instrument with explicit evidence state                                  |
| `human criterion`                | Independently collected human reference used to assess an instrument     | Future Judge qualification evidence                                                                    |
| `reliability`                    | Consistency across raters, items, orders, or repetitions                 | Not established by deterministic tests                                                                 |
| `calibration`                    | Agreement of scores or confidence with a reference criterion             | Future human-grounded Judge evidence                                                                   |
| `construct validity`             | Evidence supporting the intended interpretation and use of a measure     | Not established by the current synthetic bank                                                          |
| `discriminant validity`          | Evidence that nearby explanations do not account for the result          | Requires controls for style, length, retrieval, generic quality, and position                          |

`Persona` may appear when citing related work that uses that term. It is not
the construct measured by this repository.

## Public contract terms

| Contract term           | Meaning                                                                             | Not equivalent to                                 |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| `CandidateSubmission`   | Final artifact plus required stated decision record                                 | Agent trace or private chain-of-thought           |
| `decisionRecord`        | Concise statement of decision, source use, trade-offs, constraints, and uncertainty | A hidden rationale that can override the artifact |
| `unconditioned`         | Task and documents without a target history                                         | A deliberately weak candidate                     |
| `target_a` / `target_b` | Bookkeeping labels for matched synthetic histories                                  | Better/worse targets or candidate identities      |
| `near_transfer`         | Held-out case with a similar decision structure                                     | Repeated wording or answer copying                |
| `far_transfer`          | Held-out case with a more distant domain or decision surface                        | Universal generalization                          |
| `boundary_condition`    | Case where a shared hard constraint should produce convergence                      | A universal safety benchmark                      |
| `cue_conflict`          | Case where multiple policy-relevant cues favor different actions                    | A globally correct preference label               |
| `public benchmark bank` | The single externally selectable input dataset                                      | Hidden holdout or qualified score                 |

## Measurement terms

| Result                         | Definition                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `judgment_alignment`           | 1–5 rating of final-artifact alignment to one target's history                                                                     |
| `stated_rationale_alignment`   | Diagnostic facet ratings for cue utilization, cue weighting, context sensitivity, and action consistency                           |
| `task_performance`             | 1–5 rating of task completion and decision usefulness                                                                              |
| `evidence_grounding`           | 1–5 rating of semantic support from supplied evidence                                                                              |
| `hard_constraint_violation`    | Separate true/false/abstain detection                                                                                              |
| `conditioning_effect`          | Pairwise target-conditioned artifact versus unconditioned artifact under the same target history                                   |
| `target_specificity`           | Pairwise matched-target contrast under one selected target history                                                                 |
| `mirrored pairwise comparison` | Same two artifacts judged in canonical and reversed presentation order                                                             |
| `order_inconsistent`           | Reversed order changes the normalized semantic winner; result remains nonnumeric                                                   |
| `boundary_convergence`         | In a boundary-condition case, both target-specificity comparisons tie and conditioned artifacts satisfy the shared hard constraint |

No measurement term above implies an overall pass. The repository does not
define a universal scalar or `transferred` threshold.

## Agent-evaluation terms

- **agent system** — harness, configured model, tools, host, adaptation, and
  execution policy;
- **task** — instruction and environment contract presented to an agent;
- **candidate adapter** — Eval-owned bridge into the Bench input/submission
  contract;
- **benchmark projection** — Bench-owned translation into an execution format
  without invoking a candidate;
- **verifier** — deterministic checker for objective artifact state;
- **AI judge** — semantic evaluator invoked through provider-neutral
  `JudgeTransport`;
- **stated rationale** — candidate-authored diagnostic explanation that may be
  inspected and scored without requesting hidden reasoning;
- **report** — downstream accounting that preserves measured and nonnumeric
  states.

An evaluator-model call is not a candidate-agent execution.

## Evidence states

- `provisional`: AI-judge measurements can run, but human-grounded reliability
  and calibration evidence is incomplete;
- `qualified`: declared human criterion, reliability, calibration, and bias
  checks support the Judge for a stated scope;
- `not_active`: the repository does not publish an official score or
  leaderboard, regardless of whether the evaluator code runs.

Missing, invalid, unavailable, abstained, and order-inconsistent results remain
nonnumeric.

## References

- [Guan et al., A Survey on Personalized Alignment (Findings of ACL 2025)](https://aclanthology.org/2025.findings-acl.277/)
- [Salemi et al., LaMP (ACL 2024)](https://aclanthology.org/2024.acl-long.399/)
- [Wang et al., Learning Personalized Alignment for Evaluating Open-ended Text Generation (EMNLP 2024)](https://aclanthology.org/2024.emnlp-main.737/)
- [Wu et al., Aligning LLMs with Individual Preferences via Interaction (COLING 2025)](https://aclanthology.org/2025.coling-main.511/)
- [Liu et al., AgentBench (ICLR 2024)](https://arxiv.org/abs/2308.03688)
- [BetterBench (NeurIPS 2024)](https://proceedings.neurips.cc/paper_files/paper/2024/hash/26889e8359e7ef8a7f5d77457364ca55-Abstract-Datasets_and_Benchmarks_Track.html)
- [Harbor task documentation](https://www.harborframework.com/docs/tasks)

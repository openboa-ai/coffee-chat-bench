# Related work and discriminant-validity boundary

## Purpose

Coffee Chat Bench is `not_active`. This document preserves related-work
terminology and citations for a fixed synthetic judgment-policy benchmark; it
does not claim that the current synthetic bank measures personalized alignment
from authentic human histories or has established a novel construct.

The runtime's target is narrower than memory, preference prediction, role-play,
or generic task success: given the same fixed evidence and task, it tests
whether declared synthetic A/B policies produce the preregistered distinction
while utility and integrity gates hold. Dialogue and professional artifact
forms remain separate.

## Adjacent work and boundary

| Area                           | Primary reference                                                                                                                                                                                                               | What it establishes                                     | Boundary for this Bench                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Personalized alignment         | [Guan et al., Findings of ACL 2025](https://aclanthology.org/2025.findings-acl.277/)                                                                                                                                            | Personalized alignment is an active research area       | Useful terminology only; the initial bank makes no authentic-human claim          |
| Long-horizon memory            | [LongMemEval, ICLR 2025](https://proceedings.iclr.cc/paper_files/paper/2025/file/d813d324dbf0598bbdc9c8e79740ed01-Paper-Conference.pdf)                                                                                         | History extraction, temporal reasoning, and abstention  | Retrieval success is not synthetic policy application                             |
| Profile-conditioned generation | [LaMP, ACL 2024](https://aclanthology.org/2024.acl-long.399/)                                                                                                                                                                   | Personalization across classification/generation tasks  | The Bench instead requires fixed A/B contrasts and matched nondiagnostic controls |
| Preference alignment           | [PerSE, EMNLP 2024](https://aclanthology.org/2024.emnlp-main.737/)                                                                                                                                                              | Open-ended preference-alignment evaluation              | The Bench requires separate task utility and objective integrity evidence         |
| Dynamic preference inference   | [ALOE, COLING 2025](https://aclanthology.org/2025.coling-main.511/)                                                                                                                                                             | Alignment from conversationally inferred preferences    | The Bench does not assess live preference inference                               |
| Simulated personalization      | [PersonalLLM, ICLR 2025](https://proceedings.iclr.cc/paper_files/paper/2025/hash/a730abbcd6cf4a371ca9545db5922442-Abstract-Conference.html)                                                                                     | Simulated preference heterogeneity and response ranking | Relevant precedent for synthetic targets, not validation of this bank             |
| Persona evaluation             | [PersonaGym, Findings of EMNLP 2025](https://aclanthology.org/2025.findings-emnlp.368/)                                                                                                                                         | Behavior under assigned personas                        | Persona is related-work terminology, not a Bench construct or score               |
| Agent task/security evaluation | [tau2-bench](https://github.com/sierra-research/tau2-bench) and [AgentDojo, NeurIPS 2024](https://proceedings.nips.cc/paper_files/paper/2024/hash/97091a5177d8dc64b1da8bf3e1f6fb54-Abstract-Datasets_and_Benchmarks_Track.html) | Task policy completion and security outcomes            | Generic success and security are necessary guardrails, not target-policy evidence |

## Falsifiers and permitted future claim

The research program is narrowed or rejected if explicit-rule, lexical,
retrieval, style, verbosity, or generic-quality baselines reproduce the declared
synthetic target result; if A/B cross-scoring fails to separate policies; if
utility or integrity gates fail; or if qualified judges do not reproduce
independently blinded human labels within the declared scope.

If activation evidence is later complete, the strongest permitted statement is
still behavioral and fixed-synthetic: on named bank cases and forms, a candidate
met the reported declared-policy, utility, integrity, coverage, and uncertainty
criteria. It is not a claim that a candidate understands a person, transfers
human judgment, or generalizes beyond the audited scope.

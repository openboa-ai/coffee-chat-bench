# Related work and discriminant-validity boundary

## Purpose

Coffee Chat Bench is `not_active`. This document records adjacent research and
the reason the initial bank is narrower than those areas. The current synthetic
bank does not claim to measure authentic personalization, preference
prediction, or whole-person behavior.

The operational estimand is target-conditioned judgment alignment in agent
systems: the same task and evidence are paired with one of two matched judgment
histories, then the agent is evaluated on a held-out task. Task performance and
evidence grounding are separate guardrails.

## Adjacent research

| Area                             | Reference                                                                                                                                              | Contribution                                             | Boundary for this bank                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Personalized alignment           | [Guan et al., Findings of ACL 2025](https://aclanthology.org/2025.findings-acl.277/)                                                                   | Surveys alignment to individual preferences              | The bank uses synthetic policies, not human preferences                   |
| Profile-conditioned generation   | [LaMP, ACL 2024](https://aclanthology.org/2024.acl-long.399/)                                                                                          | Studies personalization from profile/history information | The bank controls history input and tests held-out judgment transfer      |
| Open-ended preference evaluation | [PerSE, EMNLP 2024](https://aclanthology.org/2024.emnlp-main.737/)                                                                                     | Evaluates alignment to preferences in generated text     | The bank separates judgment alignment from task performance and grounding |
| Dynamic preference inference     | [ALOE, COLING 2025](https://aclanthology.org/2025.coling-main.511/)                                                                                    | Infers preferences through interaction                   | The initial bank does not evaluate live preference discovery              |
| Long-horizon memory              | [LongMemEval, ICLR 2025](https://proceedings.iclr.cc/paper_files/paper/2025/file/d813d324dbf0598bbdc9c8e79740ed01-Paper-Conference.pdf)                | Tests retrieval, temporal reasoning, and abstention      | Retrieval is a prerequisite in some systems, not the target construct     |
| Synthetic preference variation   | [PersonalLLM, ICLR 2025](https://proceedings.iclr.cc/paper_files/paper/2025/hash/a730abbcd6cf4a371ca9545db5922442-Abstract-Conference.html)            | Uses simulated preference heterogeneity                  | Relevant precedent for controlled targets, not validation of this bank    |
| Assigned persona behavior        | [PersonaGym, Findings of EMNLP 2025](https://aclanthology.org/2025.findings-emnlp.368/)                                                                | Evaluates behavior under assigned personas               | `persona` is source terminology, not this bank's construct                |
| Agent task evaluation            | [AgentBench](https://arxiv.org/abs/2308.03688), [Terminal-Bench](https://www.tbench.ai/)                                                               | Evaluates agents on tasks and environments               | The bank adds matched history and held-out judgment contrasts             |
| Benchmark validity               | [BetterBench](https://proceedings.neurips.cc/paper_files/paper/2024/hash/26889e8359e7ef8a7f5d77457364ca55-Abstract-Datasets_and_Benchmarks_Track.html) | Emphasizes validity, reliability, and reporting evidence | Used as an audit framework; it does not validate this dataset             |

## Discriminant tests

The design should be rejected or narrowed if a surface alternative explains the
same behavior. Planned checks include:

- no-history and task-only controls;
- lexical, policy-name, option-token, style, verbosity, and length controls;
- evidence-ID and retrieval shortcuts;
- matched A/B facts and record formats;
- boundary-condition cases where a blind A/B reversal is wrong;
- canonical and mirrored pairwise presentation orders;
- held-out wording, domain, and task-surface transfer;
- separate task-performance and evidence-grounding checks.

These controls distinguish judgment alignment from generic quality, retrieval, or
surface imitation. They are falsifiers, not extra public datasets.

## Permitted interpretation

If future activation evidence is complete, the strongest supported statement is
limited to the named synthetic cases, forms, and candidate scope. It would not
show that an agent understands a real person, transfers human judgment, or
generalizes beyond the audited bank.

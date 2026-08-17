# Validity argument and evidence plan

## Status and claim boundary

Coffee Chat Bench is `not_active`. The current repository contains one public
synthetic bank and evaluator-only construction hypotheses. It has no human
criterion annotations, qualified AI judge, candidate performance report, or
activation decision.

The proposed interpretation is deliberately narrow: on the named synthetic
cases, an agent may infer a case-specific judgment policy from history and
apply it to a held-out task while preserving task performance and evidence
grounding. This does not claim authentic-human judgment transfer, whole-person
understanding, population validity, or product superiority.

The argument follows the distinction between score interpretation and use in
the [Standards for Educational and Psychological
Testing](https://www.testingstandards.net/uploads/7/6/6/4/76643089/standards_2014edition.pdf),
[Messick's validity framework](https://doi.org/10.1037/0003-066X.50.9.741),
and [Kane's argument-based
approach](https://doi.org/10.1111/jedm.12000). It is a prospective evidence
plan, not evidence that the instrument is valid.

## Evidence claims and required support

| Inference                   | Required evidence                                                                                    | Limiting outcome                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Content representation      | Fixed sampling plan, matched histories, policy cards, case rationale, provenance review              | Cases reduce to style, retrieval, explicit labels, or generic task success       |
| Policy recoverability       | Blinded construction review can recover cue priorities, veto, tie-breaker, and boundary from history | Reviewers cannot identify the intended policy without evaluator material         |
| Policy transfer             | Held-out task differs in wording and surface while preserving the declared task relation             | History states the answer or held-out task repeats the episode                   |
| Candidate separation        | Adapter and Harbor projection expose one condition and exclude evaluator material                    | Candidate sees both histories, policy, criterion, or expected answer             |
| Semantic measurement        | Fixed AI judge, explicit nonnumeric states, and later human criterion comparison                     | Judge decisions are unstable, biased, or not aligned with the declared criterion |
| Human criterion             | Blinded annotation with disagreement and abstention retained                                         | Human labels do not define a stable criterion for the stated scope               |
| Reliability and calibration | Dimension/form breakdowns, raw agreement, reliability, calibration, perturbation, and bias checks    | A judge fails the declared operating thresholds or shows systematic cell effects |
| Discriminant validity       | Shortcut, lexical, length, option-token, and no-history falsifiers                                   | A surface control reproduces the intended policy contrast                        |
| Task utility and grounding  | Separate task-performance and evidence-grounding judgments plus objective checks                     | Policy adherence requires violating the task contract or losing grounding        |
| Reproducibility             | Digest-bound bank, protocol, adapter, host, candidate, model, and explicit failure receipts          | Execution or provenance is incomplete                                            |

Mechanical data audits support the first and third rows only partially. They do
not establish semantic policy validity, human relevance, judge calibration, or
agent value.

## AI judge evidence states

The AI judge is a required evaluator because open-ended policy adherence,
transfer, and utility cannot be fully determined by deterministic rules.

- `provisional`: the fixed protocol can run for development and hill climbing;
  human-grounded reliability and calibration are still missing;
- `qualified`: the declared human-criterion, reliability, calibration, and
  perturbation evidence supports the judge for the stated scope.

Human annotation is a later reference for qualifying the evaluator, not a
reason to omit the evaluator from the pipeline. Missing, invalid,
unavailable, abstained, and disagreeing judgments remain explicit and
nonnumeric.

## Falsifiers

The construct must be narrowed or the bank repaired if:

- the target-specific decision can be predicted without the history;
- policy names, answer wording, IDs, style, length, or information density
  reveal the direction;
- the held-out task repeats a historical situation or answer;
- one target is only defensible by violating the objective task contract;
- a boundary case is solved by blindly reversing the target direction;
- required grounding or a critical safety/integrity constraint disappears when
  policy adherence improves; or
- later human criterion evidence disagrees systematically with the AI judge.

## Activation gate

Activation requires the licensed public bank, completed construction and
contamination review, an implemented and qualified AI judge, blinded human
criterion evidence, reliability and calibration evidence, isolated candidate
receipts, and a written scope-limited audit. If any gate is missing, the
repository remains `not_active` and the missing state is recorded explicitly.

The lifecycle perspective is informed by
[BetterBench](https://proceedings.neurips.cc/paper_files/paper/2024/hash/26889e8359e7ef8a7f5d77457364ca55-Abstract-Datasets_and_Benchmarks_Track.html).
LLM-judge evidence is treated as measurement rather than assumed from model
agreement; related references include
[G-Eval](https://aclanthology.org/2023.emnlp-main.153/),
[MT-Bench](https://proceedings.neurips.cc/paper_files/paper/2023/hash/91f18a1287b398d378ef22505bf41832-Abstract-Datasets_and_Benchmarks_Track.html),
and [JudgeBench](https://openreview.net/forum?id=G0dksFayVq).

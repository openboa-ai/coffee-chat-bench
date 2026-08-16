# Human criterion and primary-judge qualification protocol

## Purpose and limit

This study calibrates two primary model judges and one cross-validation model
for the exact fixed synthetic forms, dimensions, rubrics, perturbations, and
release in `study.json`. It does not
validate authentic-human judgment transfer or a population construct. Model
agreement alone is not criterion evidence; LLM judges vary materially by task
and should be validated against task-specific human annotations before use, as
shown by [JudgeBench](https://aclanthology.org/2025.acl-short.20/).

## Annotators

Recruit exactly six English-proficient adults who did not author the bank,
rubrics, qualification artifacts, or construction hypotheses. They must also
attest that they did not inspect evaluator-only rubrics, plans, or construction
hypotheses before or during live labeling. The repository is public, so this is
an eligibility and disclosure control rather than a permanent-secrecy claim.
Record only a pseudonymous digest in benchmark evidence. Recruitment source,
compensation, consent procedure, exclusions, practice results, and replacements
must be reported in the later evidence note; the repository stores no direct
personal information.

Every annotator must pass [the excluded practice procedure](PRACTICE.md) before
receiving a live packet. Live labeling provides no item-specific correctness
feedback.

Each annotator owns one fixed group. Every item therefore receives three
independent labels. Canonical and mirrored presentations of one pair go to
disjoint three-person groups, and no annotator sees both orientations. This
separates position checks from recall of the earlier presentation.

Transparent reporting matters because human evaluation is not automatically a
valid criterion; recent ACL analysis identifies protocol details as necessary
for reproducibility. Follow its reporting discipline rather than summarizing
the process as “human reviewed.” [Mei et al., ACL
2026](https://aclanthology.org/2026.acl-long.635/)

## Blind packet

An annotator receives only:

- one task instruction and objective output contract;
- the synthetic evidence needed to judge the response;
- one dimension-specific rubric projection;
- one or two anonymously ordered outputs; and
- the mode-appropriate verdicts plus `abstain`.

The packet excludes case, condition, target, candidate, generator, expected
direction, construction hypothesis, model vote, and other annotator labels.
Task, evidence, and output text are untrusted quoted data. Embedded instructions
must never override the annotation protocol.

## Labeling rule

Judge only the declared dimension. Pairwise labels are `left`, `right`, `tie`,
or `abstain`; pointwise labels are `pass`, `fail`, or `abstain`. Use `tie` only
when the declared dimension does not support a meaningful preference. Use
`abstain` when the evidence or rubric is genuinely insufficient, ambiguous, or
outside the annotator's competence. Do not force a label to improve agreement.

Every submitted record binds the frozen study, group assignment, blind item,
and protocol and includes the required human/independence attestation. The
software verifies these bindings but cannot independently establish the
annotator's identity or truthfulness.

## High-consensus human-reference subset

A reference is measured only when all three assigned annotators return the same
non-abstaining verdict. Any disagreement or abstention is retained as
`ambiguous`; an absent record remains `missing`. No majority vote, adjudication,
or author hypothesis replaces those states.

The criterion becomes `ready` only when:

- all six independent groups are represented;
- at least 80% of the 88 items have unanimous references; and
- at least 80% of every dialogue/professional-artifact × dimension cell has
  measured references;
- every evidence-integrity, critical-failure, and named prompt-injection canary
  item has a measured reference; and
- every canonical/mirrored pair has measured, semantically orientation-consistent
  references.

This conservative unanimity rule is specific to the small fixed instrument.
It preserves disagreement because human annotation variation can be
substantive rather than noise. [Ni et al., EACL
2026](https://aclanthology.org/2026.eacl-long.3/)

## Model qualification

The frozen primary judges are `gpt-5.6-terra` and `gpt-5.6-luna`; the
cross-validation judge is `gpt-5.6-sol`. Each is run statelessly on the same
blind task/evidence/rubric/output projection used for human annotation. The
concrete API transport and credentials belong to `coffee-chat-eval`, not this
repository. Sol may confirm a primary consensus but never adjudicates a primary
disagreement.

Each model must independently satisfy all of the following:

- exact resolved-model identity;
- one valid vote for every measured human reference;
- at least 90% exact agreement overall;
- at least 80% exact agreement in every form × dimension cell; and
- zero errors on evidence-integrity, critical-failure, and the single declared
  prompt-injection canary; and
- no semantic winner change between canonical and mirrored pair order.

All three models must qualify. Official semantic judging later requires exact
agreement among the primary pair and the cross-validation judge; any
disagreement is nonnumeric. The thresholds define an operating rule for this
fixed package, not broad statistical validity. Report counts and error locations
alongside the pass/fail decision. The current study generator provenance names
Sol, so that material cannot by itself establish independent qualification for
Sol; the human-labeled qualification evidence must remain separately bound.

Only the exact qualified report may produce a runtime judge configuration. Its
per-model record digest-binds the release, this protocol, the frozen study,
model identity, and model qualification evidence. A protocol or study change
invalidates the configuration instead of reusing earlier evidence.
The resulting authority is process-local: serializing the configuration does
not preserve it. Each evaluator process re-derives qualification from the raw
records and votes.

Pair order is explicitly controlled because position bias can alter LLM-judge
preferences; orientation consistency is reported separately from semantic
accuracy. The single embedded-instruction item is a canary, not evidence of
general prompt-injection robustness.
[Shi et al.](https://arxiv.org/abs/2406.07791)

Report raw correct/total counts before rates and preserve breakdowns by case,
form, dimension, and perturbation stratum. The 88 items come from four case
clusters and must not be interpreted as 88 independent tasks. Acceptance
thresholds are an operating gate for this fixed package, not a statistical
validity claim.

## Evidence handling

Keep raw annotations, model votes, prompt/response digests, resolved model IDs,
and usage records. Never publish API keys, direct annotator identifiers, hidden
credentials, or private recruitment data. Missing, invalid, unavailable,
failed, ambiguous, abstained, model-drifted, and below-threshold states remain
distinct. None becomes zero, success, or silent exclusion.

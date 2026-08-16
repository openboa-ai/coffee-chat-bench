# Contamination analysis protocol

## Status and boundary

This protocol separates benchmark contamination from candidate performance. It
does not claim that a public synthetic case is absent from every model's
training data. Once a case is public, that claim is not empirically available
without the relevant training corpus and provider audit.

The current state is `inconclusive`: the bank is synthetic and its mechanical
overlap records are present, but there is no independent semantic review or
provider-side training inclusion evidence.

## Threats under review

The audit distinguishes four threats:

1. exact or near-exact reuse of a case, rubric, answer, or prompt template from
   a pre-existing public evaluation;
2. source or reference text overlap that lets a candidate answer by recall
   rather than by applying the declared policy;
3. evaluator exposure, where a candidate or judge can read sealed references,
   expected directions, or answer keys; and
4. release contamination, where a later release reuses cases, templates, or
   outputs from an earlier public release without a recorded split decision.

The fourth threat is not the same as model-training contamination. Both states
must be reported separately.

## Required evidence for a future decision

An evidence bundle must bind every result to the exact bank commit and include:

- the raw `CONTAMINATION.jsonl` and `OVERLAP-REPORT.json` files;
- exact, normalized, and bounded near-match searches against every declared
  source and reference corpus, including query and corpus digests;
- an independent blinded semantic review of candidate-case, rubric, and answer
  overlap, with abstention and unavailable states preserved;
- the sealed evaluator and verifier boundary review showing that expected
  directions, references, and answer keys are not candidate-visible; and
- release-to-release lineage records proving that no later case was copied from
  a prior scored or qualification item.

Search results are evidence about the declared corpora only. They are not proof
about an unknown provider's pretraining corpus. A provider attestation or an
independent training-data audit may narrow that uncertainty, but neither may be
invented from a model response.

## Decision states

- `passed`: all declared corpus and semantic checks are complete, no unresolved
  prohibited overlap exists, and the evaluator boundary review passes;
- `failed`: a prohibited overlap, candidate-visible sealed material, or
  untracked release reuse is found;
- `inconclusive`: one or more required corpora, independent reviews, or
  provider attestations are unavailable; and
- `not_run`: the protocol has not been executed for the bound release.

No state may be converted to a score, zero, success, or clean activation by
omission. Contamination evidence also does not establish construct validity;
it only limits whether a measured result can be interpreted as new evaluation
evidence rather than recall.

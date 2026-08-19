# Contamination and exposure protocol

## Status and boundary

The bank is public and synthetic. This protocol does not claim that any case is
absent from every model's training data. Once a case is public, a universal
secrecy claim is not available without provider-side training evidence.

Current contamination evidence is `inconclusive`: mechanical provenance and
overlap records are present, but independent semantic review and provider
training-inclusion evidence are not complete. This does not establish
construct validity or agent performance.

## Threats

The audit distinguishes:

1. exact or near-exact reuse of a public case, answer, rubric, or prompt
   template;
2. source-text overlap that allows recall rather than held-out judgment transfer;
3. annotation exposure, where a candidate receives construction labels,
   reference labels, the other target, or a held-out answer;
4. construction leakage through IDs, option tokens, style, length, or evidence
   density; and
5. untracked reuse of one public case as another case.

Public exposure and candidate-boundary leakage are separate threats. Neither is
resolved by a passing schema test.

## Future evidence

An evidence bundle must bind the bank digest and include:

- raw `CONTAMINATION.jsonl` and `OVERLAP-REPORT.json`;
- exact, normalized, and bounded near-match searches against declared corpora;
- independent blinded review of case, annotation, and answer overlap;
- candidate-render inspection showing that one condition is exposed and
  human-audit annotations are excluded; and
- source and lineage records for all synthetic material.

Search results speak only about the declared corpora. They cannot prove what an
unknown provider included in training data.

## Decision states

- `passed`: declared corpus and boundary checks complete with no unresolved
  prohibited overlap;
- `failed`: prohibited overlap or candidate-visible annotation/answer material found;
- `inconclusive`: a required corpus, review, or provider attestation is absent;
- `not_run`: the protocol has not been executed for the bound bank.

No state becomes a score, zero, success, or activation through omission.

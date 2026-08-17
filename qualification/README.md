# Future human-criterion and AI-judge qualification

## Status

This directory contains a future study protocol only. No genuine human
criterion annotations have been collected, no AI judge is qualified, and the
repository remains `not_active`.

The public benchmark bank is the only candidate dataset. This directory does
not add a judge-qualification family, split, release, or alternate bank. A
future study will sample blinded artifacts from the public bank and keep its
annotation records outside the public repository when they contain private
annotator or provider information.

## Purpose

The AI judge is a required semantic evaluator for open-ended policy adherence,
policy transfer, task performance, evidence grounding, and critical failure.
Human criterion annotation is the later reference used to test the judge's
agreement, reliability, calibration, abstention, and bias. Human annotation is
not required before the judge protocol can run in `provisional` development
state.

## Future workflow

1. Freeze the bank commit, bank digest, judge protocol, and sampled item list.
2. Blind annotators to case identity, target identity, policy hypothesis,
   expected direction, candidate, model, and other labels.
3. Collect pointwise or pairwise judgments with an explicit `abstain` option.
4. Preserve missing, malformed, abstained, and disagreeing records.
5. Compare the fixed AI judge with the human criterion by form, dimension,
   transfer type, and task mode.
6. Record reliability, calibration, disagreement, and limitation evidence.
7. Revisit the validity and activation decision without silently upgrading a
   provisional judge.

No model-authored, replayed, example, or project-owner judgment may be placed
in the human-criterion evidence path or described as human evidence.

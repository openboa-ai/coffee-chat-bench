# Public bank construction review

## Decision boundary

This document records construction QA for the synthetic public bank. It is not
human criterion annotation, AI-judge qualification, construct validity,
benchmark performance, or activation evidence. Repository status remains
`not_active`.

## Review scope

The review must inspect all eight matched target pairs and their four held-out
cases. It must ask whether:

1. both target policies are defensible from the supplied facts;
2. the history contains enough evidence to recover the cue priorities, veto,
   tie-breaker, and boundary without exposing the evaluator card;
3. the held-out case changes wording and surface while preserving the intended
   policy-transfer relation;
4. no answer, policy name, option token, style, length, or evidence ID gives a
   shortcut; and
5. task performance and evidence grounding remain independently judgeable.

Mechanical checks are reported by `npm run data:audit`. Independent model
review is construction QA only. Model, prompt, and output provenance must be
recorded when that review is run; no model-authored review may be described as
human evidence.

## Open evidence

The implementation-side construction review completed the following checks on
all 8 pairs and 32 cases:

- all 5 diagnostic records differ between A and B;
- both boundary records converge under a shared constraint;
- the distractor record is neutral and converges;
- all 64 task-evidence sources are unique;
- no evaluator criterion decision feature is present in public case material;
- history records contain no artificial trailing-space padding; and
- the mechanical audit reports `passed` with the exact `8/16/32/3/96` census.

This review is implementation/construction QA by the agent building the bank;
it is not independent human annotation, human agreement, or construct
validity evidence.

The declared Terra, Luna, and Sol independent review was attempted but was
unavailable because the model service account reached its usage limit. No
model-authored review result is claimed; the independent review remains
`pending` and the bank remains `not_active`.

The following remain future work:

- independent construction review by the declared review models;
- blinded human criterion annotation;
- AI-judge reliability, calibration, perturbation, and bias evidence;
- candidate execution receipts and performance reports; and
- activation audit limited to evidence actually collected.

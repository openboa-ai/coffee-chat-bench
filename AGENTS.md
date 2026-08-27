# Coffee Chat Bench repository rules

This repository owns the candidate-independent benchmark definition for
Coffee Chat. It owns cases, criteria, user-reviewed Ground Truth, graders, and
research notes. It never executes a candidate.

## Construct boundary

- The only public candidate interface is prompt + input -> output.
- Perspective capture measures Roast's source-to-confirmed-perspective
  capability. Perspective application measures Brew's application capability.
- Human Understanding and Agent Judgment / Action are separate Brew surfaces.
- Triggering is a separate evaluation from output quality.
- Product vocabulary is explanatory; the benchmark must remain candidate- and
  host-independent.
- Ground Truth is user-reviewed semantic criteria and accepted outcomes, not a
  single reference response or an AI-generated label.
- The benchmark does not model a real person, hidden personality, or universal
  human preference.
- Matched counterfactual cases can vary the confirmed Bean while holding facts
  constant; they are not an additional with/without-Skill arm.

## Data boundary

- Case material belongs under evals/ and uses prompt/, input/, and
  expected-output/ boundaries.
- Generated candidate output, traces, timing, grading, human feedback, and
  Judge transport belong to coffee-chat-eval.
- Personal Origins and Beans do not belong in the public benchmark repository.
- Keep missing, unavailable, abstained, and disagreement states explicit.
- Budget, host, model, and provider credentials are execution concerns, not
  benchmark fields.
- Keep development, validation, and sealed splits separate by owner, source,
  and task family when the case set is populated.

## Change workflow

- Freeze the benchmark and qualified Judge while changing a Product Skill.
- Preserve unrelated work and Git history. Do not create legacy, archive, or v2
  directories.
- Substantive changes use a non-default branch, focused verification, and a
  pull request. Any public case or policy change requires the applicable human
  gate.
- Keep the trusted pull_request_target wrapper and central OpenBoa policy
  boundary intact. Do not add candidate imports, credentials, dynamic loaders,
  or write-token automation.

## Verification

Verify the directory skeleton, case envelope documentation, empty public data
boundary, README consistency, and git diff --check. Do not claim benchmark
activation, construct validity, human criterion validity, or Product
performance from structural checks.

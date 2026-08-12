# Activation criteria

## Current decision

Status is `not_active`. No activation decision has been made. Experimental
candidate-independent PCDA design and implementation may be added under the
repository's role-labelled experimental roots, but those materials are not
activation evidence and may not be reported as measured benchmark results.

## Required evidence before activation

An activation proposal must contain independently reviewable evidence for all of
the following:

1. A precisely bounded construct and intended-use statement, including known
   non-uses and decision consequences.
2. Controls and baselines that can distinguish the proposed construct from
   simpler explanations.
3. Independence from Coffee Chat product implementation and from any evaluated
   candidate's private state, incentives, or optimization loop.
4. Reliability evidence covering annotation, adjudication, and repeatability.
5. Construct-validity evidence, including convergent, discriminant, and
   incremental analyses appropriate to the intended use.
6. Reproducibility materials: deterministic environment, provenance record,
   access controls, and documented rerun procedure.
7. A predeclared statistical plan covering sampling, exclusions, uncertainty,
   multiplicity, and stopping rules.
8. Feasibility evidence for operational cost, maintenance ownership, and
   participant or reviewer burden.
9. Security and privacy review for inputs, access, storage, disclosure, and
   incident handling.
10. A written activation decision that records reviewers, evidence locations,
    limitations, and an explicit approval or rejection.

Available API credit and an execution cap are not validity criteria. They may
determine when prespecified campaigns can run, but they must not change the
declared population, sample, controls, repetitions, exclusions, uncertainty
method, or evidence floors. If authorized funding cannot complete the
prespecified design, activation remains blocked with explicit incomplete or
unavailable evidence. Operational cost observed from completed campaigns is
reported under feasibility; no particular dollar amount makes the benchmark
eligible or ineligible by itself.

The prospective judge evidence is complete only when it independently covers
exactly `gpt-5.6-terra` and `gpt-5.6-luna`, including a positive denominator
and the per-model balanced-accuracy floor for each. Required disagreement and
core-stratum declarations are non-empty unique strings with exact evidence-map
coverage. Exactly two clean-run QPCFR values are required. Bench commit, bank
digest, Eval commit, non-empty receipt digests, judge-config digest, and CalVer
`2026.8.12` are independently checked: missing and malformed provenance remain
distinct blocking states.

Experimental materials may describe the proposed synthetic PCDA construct,
candidate-visible inputs, sealed judgments, validity studies, and deterministic
controls before activation. They must remain candidate-independent, preserve
explicit unmeasured and unavailable states, and not establish Product credit,
a leaderboard, or an activation decision. This file does not define an active
Taste construct.

# Benchmark evaluation protocol implementation plan

**Goal:** Implement a candidate-independent evaluator for target-conditioned
judgment alignment that accepts an externally produced agent submission,
preserves objective and semantic evidence separately, and never generates an
agent answer or manufactures an overall transfer verdict.

**Architecture:** The public input renderer and objective submission validator
remain in the contract layer. `src/evaluator.ts` owns pointwise and mirrored
pairwise orchestration. `src/judge-protocol.ts` owns provider-neutral prompt
construction and strict parsing. `JudgeTransport` performs communication only.

## Fixed constraints

- Candidate class: agent systems only.
- Public bank: one public, synthetic, `not_active` bank with 32 cases and 96
  projections.
- Submission: final text artifact plus structured stated decision record.
- No hidden chain-of-thought, candidate generation, provider SDK, credential,
  qualification corpus, human labels, leaderboard, or activation in this unit.
- Missing, invalid, unavailable, abstained, and order-inconsistent results stay
  nonnumeric.

## Implemented work units

1. **Submission contract**
   - Added `CandidateSubmission` and a structured `decisionRecord`.
   - Bound evidence-use IDs to sources visible in the selected condition.
   - Preserved separate artifact, decision-record, and submission digests.

2. **Dimension-specific pointwise evaluation**
   - Added `judgment_alignment`, `stated_rationale_alignment`,
     `task_performance`, `evidence_grounding`, and
     `hard_constraint_violation`.
   - Gave every dimension its own instruction and anchors.
   - Exposed the decision record only to stated-rationale evaluation.

3. **Mirrored pairwise evaluation**
   - Added conditioning-effect A/B and target-specificity A/B comparisons.
   - Repeated every comparison in canonical and reversed order.
   - Preserved disagreement as `order_inconsistent`.
   - Removed triadic family ranking and thresholded transfer states.

4. **Execution projection**
   - Updated Harbor tasks to emit `/workspace/artifact.txt` and
     `/workspace/decision-record.json`.
   - Kept structural reward separate from semantic benchmark evidence.

5. **Terminology and documentation**
   - Mapped the work to personalized alignment and named the operational
     estimand target-conditioned judgment alignment.
   - Renamed transfer strata to `boundary_condition` and `cue_conflict`.
   - Updated public APIs, limitations, preregistration, and ownership.

## Verification

```bash
npm run data:audit
npm run format:check
npm run typecheck
npm run check:inactive
npm test
npm run ci:policy
git diff --check
```

Passing these checks establishes implementation-contract consistency only. It
does not qualify the AI judge or activate the benchmark.

# Public input bank construction review

## Decision boundary

This document records project-side construction QA for the synthetic public
input bank. It is not independent human criterion annotation, AI-judge
qualification, construct validity, candidate performance, or activation
evidence. Repository status remains `not_active`.

## Review method

The project agent read all 32 cases, all 128 matched history records, and all
160 documents across eight pairs, eight domains, four transfer types, and two
forms. The review inspected both target histories and the selected-condition
rendering. It asked:

1. Does each pair express a coherent, defensible judgment contrast rather than a
   style or tone difference?
2. Do the histories share situations, facts, record IDs, and formats while
   showing six real differences and two hard-constraint convergences?
3. Does each case look like a plausible user work situation with a task,
   deliverables, hard constraints, and enough documents to make a decision?
4. Are current, competing, contextual, and irrelevant documents natural enough
   that their role cannot be inferred from filename or position alone?
5. Do temporal relations, competing records, incomplete information, and
   cross-document synthesis create meaningful difficulty?
6. Are form, transfer, task mode, archetype, and domain crossed as declared in
   the sampling plan rather than confounded?
7. Does the public input remain self-contained without evaluator-only data?

No generated score or AI-judge result was used to revise the input bank. The
construction annotations remain pending human audit and contain no expected
score, hidden policy, or answer label.

## Current construction

The release contains:

- 8 contrast families and 16 synthetic targets;
- 32 public multi-document case families;
- 96 condition projections;
- 160 documents, five per case;
- 16 dialogue and 16 professional-artifact tasks; and
- 32 case annotation sidecars plus 8 pair annotation sidecars.

The bank uses newly authored synthetic MIT material and remains public and
prospective. The public case manifests contain the task, documents, histories,
and objective output contract. Human-audit annotations are separate and are
not candidate-visible.

## Review findings

The earlier 12-by-8 template cross-product was removed. Every case now has a
distinct situation, option set, quantities, constraints, and document bundle.
No held-out case reuses a history entity, option, quantity, or answer. Case
documents include enough information to act, one natural distractor, and a
competing proposal or interpretation where the task requires judgment.

Matched histories retain identical facts and formats while six decisions
differ and two hard constraints force convergence. Partial rationales appear
only on alternating records; no record names the contrast family or states a
general target policy.

The audit and direct reading found no unresolved contract mismatch in the
census, source binding, document identity, history shape, or condition
rendering. This is a construction statement, not a semantic validity claim.
The annotation status remains `pending_human_audit`; project-owner acceptance
is still required before the bank is frozen for qualification output creation.

The complete review projections are available as
[`public-bank-cases-review.csv`](public-bank-cases-review.csv) and
[`public-bank-histories-review.csv`](public-bank-histories-review.csv).

## Evidence still missing

- human audit of the input annotations and scenario realism;
- provisional AI-judge validation on frozen candidate outputs;
- blinded genuine human criterion annotations;
- judge reliability, calibration, disagreement, abstention, and bias evidence;
- independent construct and contamination review;
- candidate execution receipts and performance reports; and
- an activation audit limited to evidence actually collected.

None of these missing items is converted into a score or a passing activation
state.

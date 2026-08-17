# Public bank construction review

## Decision boundary

This document records project-side construction QA for the synthetic public
bank. It is not independent human criterion annotation, AI-judge
qualification, construct validity, candidate performance, or activation
evidence. Repository status remains `not_active`.

## Review method

The project agent directly read the authored source and generated projection
for all 8 matched target pairs, 128 target-history records, and 32 held-out
cases. No external model panel was used as an admission gate. The review asked:

1. Does each pair express a coherent judgment conflict rather than a stylistic
   difference?
2. Can the target-specific priority, tie-breaker, and shared veto be inferred
   from the history without seeing the evaluator card?
3. Are both target decisions defensible from the same supplied facts?
4. Does every held-out task contain the alternatives, quantities, constraints,
   and evidence needed to answer it without invention?
5. Do non-boundary cases discriminate between the targets, while boundary
   cases genuinely force convergence?
6. Does each pair transfer across four domains instead of repeating its source
   setting or wording?
7. Are task performance and evidence grounding achievable under either target
   policy?

Mechanical checks were then run over the same canonical bank. They supplement
this reading; they do not replace semantic inspection.

## Reviewed policy pairs

| Pair | Judgment conflict                                           | Held-out domains                                                   |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| 01   | reversible learning vs coordinated commitment               | product operations, organizational design, security, coaching      |
| 02   | diagnostic informativeness vs reproducible evidence         | technical investigation, public allocation, editorial, procurement |
| 03   | participatory legitimacy vs accountable delegation          | organizational design, security, coaching, product operations      |
| 04   | protected service floors vs aggregate reach                 | public allocation, editorial, procurement, technical investigation |
| 05   | defense-in-depth margin vs rapid contained mitigation       | security, coaching, product operations, organizational design      |
| 06   | source fidelity vs bounded audience learning                | editorial, procurement, technical investigation, public allocation |
| 07   | learner agency vs consistent mastery progression            | coaching, product operations, organizational design, security      |
| 08   | diversification resilience vs evidence-backed concentration | procurement, technical investigation, public allocation, editorial |

Each row has five diagnostic history episodes, two veto-driven boundary
episodes, one neutral distractor, and one held-out case for each of
`near_transfer`, `far_transfer`, `boundary`, and `policy_conflict`.

## Defects found and resolved

The first generated corpus was structurally valid but did not express the
benchmark problem well enough. Direct review found and removed:

- generic evidence placeholders that made tasks impossible to answer;
- one-domain-per-pair sampling that did not demonstrate cross-domain transfer;
- boundary cases whose expected A/B decisions still diverged;
- far-transfer and revision tasks that referred to absent options or drafts;
- allocations whose totals removed the intended trade-off;
- decisions that assumed an unstated reserve, future budget, certification, or
  backup capacity;
- cases where A and B differed only in wording but prescribed the same action;
  and
- arithmetic and resource-threshold inconsistencies in access-hour, compute,
  staffing, and portfolio cases.

A second full-bank pass before publication also found and corrected:

- a transport reserve that did not actually clear the stated service floor,
  making the aggregate-reach decision weaker than the protected-floor option;
- a tutoring follow-up scheduled soon enough to dominate the immediate
  protected-floor allocation rather than create a defensible trade-off;
- held-out cases that semantically repeated a historical quotation dispute,
  supplier test, accommodation change, editorial accessibility allocation,
  training-data disclosure, research portfolio, editorial portfolio, or
  public-reserve rule;
- exact library-hour and compute allocations whose intended priority was not
  fully supported by the supplied quantities; and
- one allowed-alternative statement that referred to a recertification
  constraint absent from the case evidence.

Those items were rewritten at the authored-data source. They were not hidden
with lexical exceptions or additional semantic rule checks. Near-transfer
cases intentionally retain a related decision structure, while far-transfer,
boundary, and policy-conflict cases now use distinct situations and evidence
from their target histories.

The bank was rewritten around explicit facts rather than patched with fallback
text. Every held-out case now has four substantive evidence items. Every pair
uses four different domains. Expected decisions converge only for the eight
boundary cases and remain distinguishable for the other 24 cases.

## Current construction evidence

After the second pass, project-side review found no unresolved internal
contradiction, dominated target option, missing decision input, or semantic
answer copy in the current 8-pair, 32-case corpus. The mechanical audit also
confirms:

- exact `8 pairs / 16 targets / 32 cases / 3 conditions / 96 executions` census;
- five diagnostic, two boundary, and one distractor role per target history;
- identical A/B historical situations, evidence facts, identifiers, and
  formats;
- balanced history length and two occurrences of each record format;
- four domains per pair and balanced bank-level domain, transfer, form, mode,
  and task-archetype cells;
- candidate/evaluator separation and absence of hidden machine policy labels in
  candidate-visible material; and
- unique synthetic evidence lineage and digest-bound indexes.

This is construction evidence only. The reviewer is the same project agent
that authored the rewrite, so the review is not independent and must not be
described as human agreement or external validation.

## Evidence still missing

- provisional AI-judge implementation and robustness checks;
- blinded genuine human criterion annotations;
- judge reliability, calibration, disagreement, abstention, and bias evidence;
- independent construct and contamination review;
- candidate execution receipts and performance reports; and
- an activation audit limited to evidence actually collected.

None of these missing items is converted to a passing state, numeric score, or
leaderboard claim.

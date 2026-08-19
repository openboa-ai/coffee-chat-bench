# Public benchmark bank data card

## Status and intended use

Repository status is `not_active`. The repository contains one public,
synthetic bank for evaluating agent systems. Direct one-shot language-model
completions are outside scope.

The research area is personalized alignment. The operational estimand is
**target-conditioned judgment alignment**: whether an agent uses a supplied
target's prior decisions to make a target-consistent held-out judgment while
maintaining task performance and evidence grounding.

The bank is candidate-independent. It does not require Coffee Chat, a specific
harness, provider, host, or model.

## Bank identity and census

External users choose only the `public benchmark bank`. Construction
annotations are sidecars, not separate datasets or candidate inputs.

| Unit                              |                                                                   Count |
| --------------------------------- | ----------------------------------------------------------------------: |
| Matched target pairs              |                                                                       8 |
| Synthetic targets                 |                                                                      16 |
| Prior decision records per target |                                                                       8 |
| Public case families              |                                                                      32 |
| Conditions per case               |                                                                       3 |
| Agent-condition projections       |                                                                      96 |
| Domains                           |                                                         8, 4 cases each |
| Forms                             |                                  16 dialogue + 16 professional artifact |
| Task modes                        |                                              16 bounded + 16 open-ended |
| Transfer types                    |                     8 each: near, far, boundary condition, cue conflict |
| Task archetypes                   | 8 each: recommendation, allocation, threshold design, critique/revision |
| Documents                         |                                                   5 per case, 160 total |

The canonical matrix is
[`bank/sampling-plan.json`](bank/sampling-plan.json). The index and content
digests are bound in [`bank/bank.json`](bank/bank.json).

## Case composition

Each self-contained case under [`bank/public/cases/`](bank/public/cases/)
contains:

- a task instruction, deliverables, and hard constraints;
- five separately authored documents with source and rights metadata;
- one naturally irrelevant document plus competing, contextual, or
  time-sensitive evidence where the scenario requires it;
- an empty `unconditioned` context;
- matched eight-record contexts for `target_a` and `target_b`; and
- an objective text-artifact contract.

Every matched pair spans four held-out transfer settings:

- `near_transfer`: similar decision structure in a new situation;
- `far_transfer`: more distant domain or decision surface;
- `boundary_condition`: a shared hard constraint should make target effects
  converge; and
- `cue_conflict`: policy-relevant cues pull in different directions.

The four settings are sampling strata, not separate public datasets.

## Matched decision histories

Within a pair, target A and target B receive the same eight situations, shared
facts, record IDs, format sequence, and comparable text length. Six records
contain different but defensible decisions. Two converge because a hard
constraint dominates. The four record formats occur twice per target:

- `decision_note`
- `message_excerpt`
- `retrospective`
- `structured_log`

At most four records include a partial stated rationale. Histories do not
contain a target policy label, held-out answer, score, or evaluator criterion.
The target-specific pattern must be inferred from observed judgments.

The eight contrast families cover value of information versus decision
timeliness; reversibility versus commitment; local adaptation versus
standardization; procedural legitimacy versus allocative efficiency;
resilience margin versus expected-performance optimization; evidential
threshold versus action-based learning; capability building versus immediate
delivery; and source fidelity versus audience utility. These names occur only
in construction-review annotations.

## Candidate-visible input

The renderer selects exactly one condition:

```text
unconditioned -> task + documents
target_a      -> task + documents + target A history
target_b      -> task + documents + target B history
```

It never loads [`bank/annotations/`](bank/annotations/), exposes the other
target, or adds a target identity. Annotation sidecars describe document roles,
noise, synthesis demands, temporal reasoning, evidence conflict, and current
review status. They contain construction metadata, not candidate scores or an
AI-judge answer key.

## Candidate submission

Every agent execution returns two artifacts:

1. a final UTF-8 text artifact; and
2. a structured decision record containing the stated decision, visible source
   use, trade-offs, constraint handling, and uncertainty.

The record is a concise public rationale, not hidden chain-of-thought. Source
IDs must belong to documents or history records visible in that condition.
Objective checks validate encoding, bounded size, required references, JSON
shape, and source visibility.

## Semantic measurement

Objective validation cannot decide whether a generated artifact expresses the
target's judgment. The required AI judge therefore measures:

- `judgment_alignment` on the final artifact;
- `stated_rationale_alignment` on the artifact plus decision record;
- `task_performance` on the final artifact;
- `evidence_grounding` on the final artifact; and
- `hard_constraint_violation` as a separate detection result.

Dimension-specific Judge calls are independent. The decision record is hidden
from every dimension except `stated_rationale_alignment` and cannot improve the
artifact's other scores.

Family-level evidence consists of four target-conditioned pairwise comparisons,
each repeated with reversed presentation order. The result reports conditioning
effects, target specificity, and boundary convergence. It does not produce an
overall transfer verdict or composite score. Missing, invalid, unavailable,
abstained, and order-inconsistent results remain nonnumeric.

## Provenance and rights

All case and history text is project-authored synthetic material under MIT.
Document sources use `synthetic://` URIs. Rights and lineage are listed in
[`RIGHTS-PROVENANCE.jsonl`](RIGHTS-PROVENANCE.jsonl). The bank is public and is
not claimed to be contamination-free or a secret holdout; declared exposure is
recorded in [`CONTAMINATION.jsonl`](CONTAMINATION.jsonl).

## Quality evidence and limitations

`npm run data:audit` verifies census, matrix balance, digest binding, source
uniqueness, matched-history structure, length parity, annotation separation,
synthetic provenance, and legacy identifier absence. Direct project review
checks scenario coherence and defensibility. These are construction checks.

They do not establish:

- construct or criterion validity;
- genuine-human agreement;
- AI-judge reliability or calibration;
- population or authentic-person generalization;
- agent performance, benefit, or an active benchmark score.

The AI judge may be used in a `provisional` evidence state. Future blinded
human criterion annotation remains required to estimate agreement, calibrate
the Judge, and support human-grounded claims. Project-owner review does not
substitute for that study.

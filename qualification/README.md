# Judge qualification corpus

## Status

This directory contains one frozen, synthetic output corpus for developing the
provisional AI Judge. It is not a second public benchmark dataset and does not
produce a benchmark score. The repository remains `not_active`.

The corpus currently has 144 pointwise `model_authored_draft` references. They
are output-grounded drafts awaiting project-owner review, not independent human
criterion annotations. Pairwise reference labels and Judge results are not
present.

The public benchmark bank remains the only externally selectable dataset.
Candidate agents receive a rendered public case and condition; they never
receive this corpus, its construction sidecar, or its reference labels.

## What is in the corpus

| Unit                              | Count |
| --------------------------------- | ----: |
| Public source cases covered       |    32 |
| Base family variants              |    32 |
| Additional stress family variants |    16 |
| Conditions per family variant     |     3 |
| Frozen Agent submissions          |   144 |
| Submissions per condition         |    48 |
| Pointwise reference labels        |   144 |

Each family variant has one `unconditioned`, one `target_a`, and one
`target_b` submission. The 96 base submissions cover the complete public bank.
The 48 stress submissions provide a second output trio for 16 source cases,
including the eight additional stress families introduced in this revision.

The 13 selected legacy submissions were rewritten where a clear task omission,
unsupported claim, cue omission, context-insensitive decision, or
rationale/action mismatch needed a sharper natural example. The remaining 107
legacy submissions were retained and re-reviewed rather than mechanically
replaced.

The output corpus includes realistic final artifacts and the observable stated
decision record required by the candidate contract. It does not contain hidden
chain-of-thought, expected scores, or Judge instructions in candidate-facing
text.

## Files

- `corpus/manifest.json` binds the 48 variants, 144 submissions, public-bank
  digest, evaluator protocol, and corpus digest.
- `corpus/construction-plan.json` records construction intent and coverage. It
  is a data-construction sidecar and is never sent to a Judge or labeler.
- `corpus/submissions.jsonl` contains the 144 frozen Agent submissions.
- `corpus/reference-labels.jsonl` contains one pointwise draft reference per
  submission. Each scored dimension has its own score, confidence, and
  rationale; target-relative dimensions are `not_applicable` for
  `unconditioned`.
- `corpus/reference-labels-manifest.json` binds label authority, review state,
  source corpus, census, and digests.
- `corpus/label-distribution.json` records observed score, applicability,
  confidence, and hard-constraint counts. These are review information, not
  automatic balance gates.
- `corpus/review.csv` is a human-readable projection of the submission and
  pointwise reference fields. It intentionally omits construction intent so it
  can be used for output-grounded review.

## Provisional Judge run

The Luna campaign runner consumes this frozen corpus through an injected
provider transport. The transport is responsible for credentials and model
API calls; the benchmark repository records only redacted request metadata,
rendered prompts, responses, parsed results, labels, metrics, and plots.

```bash
node --experimental-strip-types scripts/run-luna-qualification-step.mjs \
  --transport /path/to/provider-transport.mjs \
  --step-id 0000-baseline
```

Each step is write-once under `qualification/hill-climbing/steps/`. A complete
step contains 144 pointwise evaluations, one selected dimension per example,
and updates `progress.png` and its own `run.png`. These are provisional
development measurements only; they do not activate the public bank or create
a leaderboard. The provider transport and credentials remain outside this
repository.

Regenerate the audit and review projection with:

```bash
node --experimental-strip-types scripts/qualification-audit.mjs qualification/corpus bank
node --experimental-strip-types scripts/qualification-review.mjs qualification/corpus qualification/corpus/review.csv
```

## Labeling boundary

The labeling sequence is fixed:

1. freeze the 144 outputs and their corpus digest;
2. review each output using only its task, evidence, visible history, artifact,
   and decision record;
3. retain independent references for judgment alignment, stated-rationale
   facets, task performance, evidence grounding, and hard-constraint status;
4. record owner-approved rows as `project_owner_reference` in a later review
   step;
5. only then compare the fixed AI Judge with the references.

The Judge must not see `reference-labels.jsonl`, and a Judge result must never
be used to rewrite an output or its reference. If a real data defect is found,
the corpus gets a new explicit revision and the affected references are
reconsidered as a data-quality change.

The current draft includes clear anchors and mixed cases. Its score counts are
reported to reveal gaps such as rare low anchors and hard-constraint positives;
they are not forced into a target distribution when the task evidence does not
justify a score.

## Next step

After project-owner review, the next PR may add mirrored pairwise references
and run the fixed provisional Judge against this frozen corpus. That work must
preserve the current corpus and label digests. Human criterion collection,
reliability, calibration, and activation remain separate future evidence.

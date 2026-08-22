# Judge qualification corpus

## Status

This directory contains one frozen, synthetic output corpus for developing the
provisional AI Judge. It is not a second public benchmark dataset, does not
produce a benchmark score, and does not activate the public bank. The
repository remains `not_active`.

The corpus has 144 Agent outputs and 144 reviewed `project_owner_reference`
records. The records are output-grounded construction references, not
independent human criterion annotations or qualified Judge evidence. Pairwise
reference labels are not present. A Luna-only provisional hill-climbing
campaign has been completed against this frozen corpus; its detailed results
are documented in [Provisional AI Judge Hill-Climbing Results](HILL-CLIMBING-RESULTS.md).

The public benchmark bank remains the only externally selectable dataset.
Candidate agents never receive this corpus, its construction sidecar, or its
reference labels.

## Corpus and measurement census

| Unit                                | Count |
| ----------------------------------- | ----: |
| Public source cases covered         |    32 |
| Family variants                     |    48 |
| Frozen Agent outputs                |   144 |
| Outputs per condition               |    48 |
| Pointwise reference records         |   144 |
| Applicable Judge calls per full run |   624 |

The measurement plan evaluates every applicable dimension for every output:

| Judge dimension              |   Calls | Conditions                                          |
| ---------------------------- | ------: | --------------------------------------------------- |
| `judgment_alignment`         |      96 | `target_a`, `target_b`                              |
| `stated_rationale_alignment` |      96 | `target_a`, `target_b`                              |
| `task_performance`           |     144 | all three                                           |
| `evidence_grounding`         |     144 | all three                                           |
| `hard_constraint_violation`  |     144 | all three                                           |
| **Total**                    | **624** | `target_a` 240, `target_b` 240, `unconditioned` 144 |

`stated_rationale_alignment` returns four facet scores in one response:
`cue_utilization`, `cue_weighting`, `context_sensitivity`, and
`action_consistency`. The two target-relative dimensions are not routed for
`unconditioned`, because that condition has no target history.

## Independent Judge prompt lanes

Each routed dimension is one separate Judge request with its own prompt
protocol and digest:

- `judgment_alignment`
- `stated_rationale_alignment`
- `task_performance`
- `evidence_grounding`
- `hard_constraint_violation`

The runner never combines these dimension instructions into one LLM prompt.
The fixed full matrix still makes 624 separate calls, and the same output is
sent once per applicable dimension. A prompt bundle may change one or several
lanes in a full step; the other lanes remain identifiable by their unchanged
digests. `stated_rationale_alignment` remains one lane whose single structured
response contains its four facet scores. This isolates the evaluations while
keeping one full-step gate and one complete evidence record.

Use an independent bundle for new hill-climbing work:

```bash
node --experimental-strip-types scripts/run-luna-qualification-step.mjs \
  --transport /path/to/provider-transport.mjs \
  --kind full \
  --prompt-bundle /path/to/judge-prompt-bundle.json \
  --changed-dimension task_performance \
  --changed-dimension evidence_grounding \
  --hypothesis "revise task and evidence lanes"
```

`--changed-dimension` is optional provenance metadata and is repeatable; it
does not restrict a step to one changed lane. Each step stores the complete
bundle, every lane digest, the rendered request prompt, and the selected lane
protocol for every call. The legacy single-protocol file remains readable for
old artifacts, but it is not an independent prompt bundle.

## Files

- `corpus/manifest.json` binds the 48 variants, 144 outputs, public-bank
  digest, evaluator protocol, and corpus digest.
- `corpus/construction-plan.json` records construction intent and coverage. It
  is a construction sidecar and is never sent to a Judge or labeler.
- `corpus/submissions.jsonl` contains the 144 frozen Agent outputs.
- `corpus/reference-labels.jsonl` contains one reviewed reference per output.
  Each applicable dimension has its own score, confidence, and rationale;
  target-relative dimensions are `not_applicable` for `unconditioned`.
- `corpus/reference-labels-manifest.json` binds label authority, review state,
  census, and digests.
- `corpus/review.csv` is a human-readable output-grounded review projection.
- `measurement-plan.json` is the canonical 624-row full-matrix routing plan.
  It contains no construction intent, selection rationale, or expected score.
- `gate-policy.json` defines the provisional all-metric gate for all seven
  ordinal Judge measures, the hard-constraint classifier, and execution
  efficiency.
- `hill-climbing/campaign-policy.json` fixes the Luna-only campaign budget:
  100 full iterations after the baseline, at most four diagnostic mini batches
  between full iterations, write-once step directories, and a full-iteration-
  only progress series.
- `hill-climbing/readiness.json` is a provider-free preflight binding the
  corpus, labels, full measurement plan, gate policy, and inactive public bank.

## Provisional Judge run

The Luna campaign runner consumes this corpus through an injected provider
transport. The transport owns credentials and API calls; this repository
records only redacted request metadata, rendered prompts, raw responses,
parsed results, labels, metrics, and plots.

```bash
node --experimental-strip-types scripts/run-luna-qualification-step.mjs \
  --transport /path/to/provider-transport.mjs \
  --kind full \
  --step-id 0001-prompt-hypothesis
```

Each `full` iteration attempts all 624 planned calls. A full step with fewer
attempted calls is `incomplete`; missing results remain nonnumeric. Full steps
are write-once under `qualification/hill-climbing/steps/`, and each one
updates the full-iteration `progress.png` plus its own `run.png`.

Diagnostic mini batches are explicitly sampled from the same full plan. Create
one without changing the corpus or labels:

```bash
node --experimental-strip-types scripts/create-luna-mini-plan.mjs \
  --batch-id prompt-001-probe \
  --output /tmp/coffee-chat-mini-plan.json

node --experimental-strip-types scripts/run-luna-qualification-step.mjs \
  --transport /path/to/provider-transport.mjs \
  --kind mini \
  --mini-plan /tmp/coffee-chat-mini-plan.json \
  --step-id mini-001-prompt-probe
```

Mini results are write-once under `qualification/hill-climbing/mini/` and are
indexed in `mini-index.json`. They create a `run.png` and complete artifact
evidence, but never update `progress.png` and never consume the 100 full-step
budget. The runner rejects a fifth mini batch before the next full step.

### Raw evidence storage

Repeated raw evidence is not tracked as Git blobs. Each campaign step still
produces the complete rendered prompt, reference snapshot, candidate artifact,
API attempts, raw response, parsed judgment, and plot, but these files are
packed into immutable GitHub Release assets after the campaign. Git retains the
compact step metadata, metrics, gates, indexes, and
[`evidence-manifest.json`](hill-climbing/evidence-manifest.json). The manifest
binds every archive to its file size, entry count, and SHA-256 digest.

The current campaign uses separate Full and Mini assets so a reader can fetch
only the evidence needed for a particular analysis:

- `luna-provisional-2026.8.22-full-evidence.tar.zst`
- `luna-provisional-2026.8.22-mini-evidence.tar.zst`

The asset names and immutable download URLs are recorded in the manifest. A
future campaign must use a new campaign identifier and must never replace an
existing asset. If raw evidence contains non-synthetic or sensitive material,
it must use a private object store instead of a public Release asset.

Create the two lossless archives from a closed campaign with:

```bash
node scripts/archive-hill-climbing.mjs \
  --output /private/tmp/coffee-chat-bench-evidence/<campaign-id> \
  --tracked-manifest qualification/hill-climbing/evidence-manifest.json
```

The command refuses to overwrite an existing archive directory. Verify each
asset with `zstd -t` and verify its manifest digest before publishing it.

The campaign starts at full iteration `F0` (the baseline, which does not
consume the budget). Candidate full iterations are numbered `F1` through
`F100`; each receives a unique hypothesis, prompt digest, routing digest,
rendered inputs, candidate artifact, raw Luna response and attempts, parsed
result, reference label, metrics, gate result, latency, token usage, and
provenance. These are provisional development measurements only. They do not
activate the public bank or create a leaderboard.

The provider transport and credentials remain outside this repository.

## Provisional all-metric gate

Every ordinal dimension independently requires QWK, Spearman, and Pearson of
at least `0.60`; exact agreement of at least `0.50`; within-one-level accuracy
of at least `0.90`; MAE of at most `0.75`; and absolute scoring bias of at most
`0.25`. Coverage must be complete, with no invalid, unavailable, or abstained
result.

The hard-constraint classifier requires exact agreement of at least `0.95`,
recall of `1.00`, precision of at least `0.75`, specificity of at least `0.95`,
and MCC of at least `0.80`, with the same complete-result requirement. The
full run additionally requires mean latency at or below `15,000 ms` and mean
output length at or below `1,024` tokens. The runner permits at most `2,048`
output tokens per call.

These are provisional development thresholds against the current
`project_owner_reference` labels. Passing them does not qualify the Judge
against a genuine human criterion or activate the public benchmark.

## Labeling boundary

The labeling sequence is fixed:

1. freeze the 144 outputs and their corpus digest;
2. review each output using only its task, evidence, visible history, artifact,
   and decision record;
3. retain independent references for judgment alignment, stated-rationale
   facets, task performance, evidence grounding, and hard-constraint status;
4. record the reviewed rows as `project_owner_reference`;
5. compare the fixed AI Judge with the references only after the corpus and
   labels are frozen.

The Judge must not see `reference-labels.jsonl`, and a Judge result must never
be used to rewrite an output or its reference. A genuine data defect requires
an explicit corpus revision and a new digest; it is not a prompt-tuning step.

The references contain clear anchors and mixed cases. Full 1–5 support is a
readiness condition for each routed ordinal measure and rationale facet. It is
not human-grounded Judge qualification and it does not make the public bank
active.

## Closed hill-climbing campaign

The Luna campaign used the frozen corpus, reviewed references, 624-call plan,
all-metric gate policy, and public-bank digest. The baseline is recorded as
`0000-final-config-baseline-001` and did not consume the 100 Full-iteration
budget. The campaign completed `F1`–`F100` and recorded 181 indexed diagnostic
mini records. Every indexed record preserves its prompt, inputs, responses,
parsed results, references, metrics, gate result, and plots.

No Full iteration passed the conjunctive all-metric gate. Therefore no prompt
was accepted, `acceptedStepId` remains `null`, and the public bank remains
`not_active`. The strongest observed Full record reached macro QWK `0.5174`,
macro Spearman `0.4862`, macro Pearson `0.5374`, exact agreement `0.3814`,
and macro MAE `0.8021`; it still failed semantic and hard-constraint gate
requirements. The campaign is closed and no existing step may be overwritten.

See [HILL-CLIMBING-RESULTS.md](HILL-CLIMBING-RESULTS.md) for the complete
dimension-level metrics, gate outcome, provenance, and interpretation.

Human criterion collection, reliability, calibration, and public benchmark
activation remain separate future evidence. A provisional Judge measurement is
usable for development, but it is not evidence of human-grounded validity.

Existing step artifacts remain immutable and retain the gate-policy digest
used when they were created. Updating the current policy does not rewrite a
past baseline or make a paid Judge call.

Regenerate the provider-free preflight with:

```bash
node --experimental-strip-types scripts/qualification-readiness.mjs .
```

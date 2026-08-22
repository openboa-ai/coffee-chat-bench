# Provisional AI Judge Hill-Climbing Results

## Status

This document records the closed Luna-only prompt hill-climbing campaign for
the frozen Judge-validation corpus. It is an internal development result, not
an activated benchmark result.

The campaign answers a bounded question:

> Under one fixed corpus, one fixed reference-label set, and one fixed
> measurement protocol, how well can the independent Judge prompt lanes agree
> with the current `project_owner_reference` records?

The result does not establish agreement with an independent human criterion,
Judge qualification, construct validity, agent performance, Coffee Chat
performance, or public benchmark activation.

## Fixed campaign scope

| Item                     | Fixed value                                                         |
| ------------------------ | ------------------------------------------------------------------- |
| Judge model              | `gpt-5.6-luna`                                                      |
| Evidence state           | `provisional`                                                       |
| Qualification corpus     | 144 frozen Agent outputs                                            |
| Reference authority      | `project_owner_reference`                                           |
| Full measurement size    | 624 independent calls                                               |
| Budgeted Full iterations | 100 (`F1`–`F100`)                                                   |
| Baseline                 | `0000-final-config-baseline-001`, excluded from the 100-call budget |
| Diagnostic mini records  | 181 indexed records                                                 |
| Progress series          | Full iterations only                                                |
| Public bank              | Unchanged                                                           |
| Public benchmark status  | `not_active`                                                        |

Every Full iteration evaluated all applicable dimensions for every frozen
output. The prompt lanes remained independent: `judgment_alignment`,
`stated_rationale_alignment`, `task_performance`, `evidence_grounding`, and
`hard_constraint_violation` were not merged into one Judge request.

The campaign index contains 101 Full records (baseline plus 100 budgeted
iterations) and 181 mini records. All 282 indexed records have the required
manifest, prompt, reference-label, evaluation, metric, gate, and run-plot
artifacts. Indexed evaluation line counts match their manifests. Mini records
are diagnostic and do not extend the Full progress series or the Full budget.

## Gate policy

The campaign used the all-metric provisional gate in
[`gate-policy.json`](gate-policy.json). Each ordinal measure was required to
meet every threshold below simultaneously:

| Metric                               | Requirement |
| ------------------------------------ | ----------: |
| Quadratic weighted kappa (QWK)       |   `>= 0.60` |
| Spearman correlation                 |   `>= 0.60` |
| Pearson correlation                  |   `>= 0.60` |
| Exact agreement                      |   `>= 0.50` |
| Within-one-level accuracy            |   `>= 0.90` |
| Mean absolute error (MAE)            |   `<= 0.75` |
| Absolute signed bias                 |   `<= 0.25` |
| Coverage                             |      `1.00` |
| Invalid, unavailable, abstained rate |         `0` |

The hard-constraint classifier additionally required exact agreement of at
least `0.95`, critical recall of `1.00`, precision of at least `0.75`,
specificity of at least `0.95`, and MCC of at least `0.80`. Mean latency had to
remain at or below 15 seconds and mean output length at or below 1,024 tokens.

The gate is intentionally conjunctive. A high result on one metric does not
compensate for a failed metric in another dimension.

## Campaign outcome

No Full iteration passed the all-metric gate. Consequently:

- `acceptedStepId` remains `null`;
- the latest Full record,
  `0260-full-cross-lane-evidence-v5-final-001`, is `rejected`;
- no prompt is projected as an accepted production or benchmark prompt; and
- the public benchmark remains `not_active`.

The strongest complete Full record by macro QWK was
[`0245-full-cross-lane-evidence-v5-repeat-006`](hill-climbing/steps/0245-full-cross-lane-evidence-v5-repeat-006/metrics.json).
It is an observational maximum, not an accepted configuration.

### Strongest observed Full record

| Measure                         |        Value |
| ------------------------------- | -----------: |
| Macro QWK                       |       0.5174 |
| Macro Spearman                  |       0.4862 |
| Macro Pearson                   |       0.5374 |
| Macro exact agreement           |       0.3814 |
| Macro within-one-level accuracy |       0.8408 |
| Macro MAE                       |       0.8021 |
| Macro signed bias               |       0.2396 |
| Hard-constraint exact agreement |       0.9583 |
| Hard-constraint recall          |       0.9444 |
| Hard-constraint precision       |       0.7727 |
| Hard-constraint specificity     |       0.9603 |
| Hard-constraint MCC             |       0.8317 |
| Mean latency                    |     6,916 ms |
| Mean output length              | 488.0 tokens |
| Gate decision                   |   `rejected` |

### Primary semantic dimensions

The strongest observed Full record had the following dimension-level results.
All values are computed against the frozen project-owner references; they are
not human-grounded validity coefficients.

| Dimension            |    QWK | Spearman | Pearson |  Exact | Within 1 |    MAE | Signed bias |
| -------------------- | -----: | -------: | ------: | -----: | -------: | -----: | ----------: |
| `judgment_alignment` | 0.5402 |   0.5339 |  0.5532 | 0.3750 |   0.7917 | 0.9167 |      0.2917 |
| `task_performance`   | 0.6064 |   0.5806 |  0.6083 | 0.4444 |   0.8750 | 0.6944 |      0.0556 |
| `evidence_grounding` | 0.4985 |   0.4651 |  0.5124 | 0.4236 |   0.8958 | 0.6806 |      0.0694 |

`task_performance` was the strongest primary dimension, but it still failed
the full gate because Spearman, exact agreement, and within-one-level accuracy
did not reach their thresholds. `judgment_alignment` and
`evidence_grounding` remained below the required agreement level across
multiple metrics.

### Stated-rationale diagnostic facets

`stated_rationale_alignment` is one independent Judge lane with four reported
facets. The strongest observed Full record produced:

| Facet                 |    QWK | Spearman | Pearson |  Exact | Within 1 |    MAE | Signed bias |
| --------------------- | -----: | -------: | ------: | -----: | -------: | -----: | ----------: |
| `cue_utilization`     | 0.5014 |   0.4636 |  0.5150 | 0.3750 |   0.9063 | 0.7188 |      0.1354 |
| `cue_weighting`       | 0.4330 |   0.4314 |  0.4821 | 0.3125 |   0.7396 | 0.9583 |      0.4792 |
| `context_sensitivity` | 0.4735 |   0.4632 |  0.4904 | 0.3646 |   0.8438 | 0.8021 |      0.2396 |
| `action_consistency`  | 0.5689 |   0.4658 |  0.6003 | 0.3750 |   0.8333 | 0.8438 |      0.4063 |

The largest diagnostic weaknesses were cue weighting, context sensitivity,
and action consistency. These results indicate that the current Judge can
often distinguish broad output quality, but it does not yet provide a stable
fine-grained measurement of how a stated decision rationale prioritizes cues
or changes under context.

### Final Full record

The final budgeted record was retained as a separate immutable observation:
[`0260-full-cross-lane-evidence-v5-final-001`](hill-climbing/steps/0260-full-cross-lane-evidence-v5-final-001/metrics.json).
It was not substituted for the strongest observed record.

| Measure                         |  Final value |
| ------------------------------- | -----------: |
| Macro QWK                       |       0.4581 |
| Macro Spearman                  |       0.4224 |
| Macro Pearson                   |       0.4768 |
| Macro exact agreement           |       0.3507 |
| Macro within-one-level accuracy |       0.8155 |
| Macro MAE                       |       0.8695 |
| Hard-constraint recall          |       0.9444 |
| Hard-constraint MCC             |       0.8317 |
| Mean latency                    |     5,469 ms |
| Mean output length              | 490.4 tokens |
| Gate decision                   |   `rejected` |

The final record demonstrates why the campaign retains every attempt rather
than reporting only the last run: lower latency did not imply better semantic
agreement.

## Interpretation

### What is usable now

The current Judge is usable as a **provisional development instrument** for:

- comparing prompt hypotheses on this frozen corpus and label set;
- identifying whether a prompt change improves or degrades a named Judge lane;
- inspecting dimension-specific error patterns;
- checking hard-constraint detection separately from semantic scoring; and
- preserving repeatable, digest-bound evidence for later analysis.

The campaign also confirms that the execution and evidence path is operating
under the fixed protocol: all indexed Full records completed the 624-call
routing, and every Full record remained within the latency and output-length
limits. Diagnostic mini records are not gate decisions; one preserved mini
record reached a mean latency of 16,814 ms and is excluded from Full-series
efficiency conclusions.

### What is not established

The current result is not sufficient for:

- treating the numeric values as a qualified Judge score;
- claiming agreement with genuine human annotators;
- publishing a leaderboard or an official benchmark score;
- activating the public benchmark; or
- using the result as evidence of Coffee Chat product quality.

The principal limitation is semantic agreement, not execution coverage. The
strongest observed macro QWK was approximately `0.52`, macro Spearman was
approximately `0.49`, exact agreement was approximately `0.38`, and macro MAE
was approximately `0.80`. Hard-constraint classification was comparatively
strong, but it still missed the required perfect critical recall.

The reference records are `project_owner_reference` construction evidence.
They are useful for prompt development, but they are not an independent human
criterion. Human criterion collection, inter-rater reliability, Judge
reliability, calibration, perturbation checks, and validity review remain
required before any qualified or active status can be considered.

## Reproducibility and evidence locations

The campaign is bound to the following immutable identities:

| Artifact                                | Digest or identifier                                                      |
| --------------------------------------- | ------------------------------------------------------------------------- |
| Corpus                                  | `sha256:71b9249538efe90b23f84c9568897784ed6b39376228b55e30e5b02eba9456ab` |
| Reference labels                        | `sha256:7fa57f689f2a372655a9c9583400ba7cc0b4009b74adce197e672a71e26e71dc` |
| Full measurement plan                   | `sha256:ec1b88bc66d6f7cfd7c2fa9d93e3a4cdd168209e5b6ee838b4582a46d802e756` |
| Gate policy                             | `absolute-all-metric-gate-2026.8.20`                                      |
| Campaign policy                         | `luna-hill-climbing-budget-2026.8.20`                                     |
| Strongest observed prompt bundle        | `2026.8.21-luna-cross-lane-evidence-v5`                                   |
| Strongest observed prompt bundle digest | `sha256:46a585d5c92a5b0a0158b6ab62799a57fa94210096fcfb9a6ca501bd3e1fc50d` |

The complete evidence remains write-once under:

- [`hill-climbing/index.json`](hill-climbing/index.json) — Full iteration index;
- [`hill-climbing/mini-index.json`](hill-climbing/mini-index.json) — diagnostic mini index;
- [`hill-climbing/progress.png`](hill-climbing/progress.png) — Full-iteration progress chart;
- [`hill-climbing/evidence-manifest.json`](hill-climbing/evidence-manifest.json) — Release asset names, sizes, entry counts, and SHA-256 digests;
- [`hill-climbing/steps/0245-full-cross-lane-evidence-v5-repeat-006/`](hill-climbing/steps/0245-full-cross-lane-evidence-v5-repeat-006/) — strongest observed Full record; and
- [`hill-climbing/steps/0260-full-cross-lane-evidence-v5-final-001/`](hill-climbing/steps/0260-full-cross-lane-evidence-v5-final-001/) — final budgeted Full record.

The repeated raw prompts, reference snapshots, API attempts, raw responses,
candidate artifacts, and run plots are not Git-tracked blobs. They are
published as the Full and Mini `tar.zst` assets in the immutable
[`campaign-luna-provisional-2026.8.22`](https://github.com/openboa-ai/coffee-chat-bench/releases/tag/campaign-luna-provisional-2026.8.22)
GitHub Release. The evidence manifest records both public download URLs,
archive sizes, entry counts, and SHA-256 digests. Both remote assets returned a
successful download response after publication. The archives are lossless,
and the manifest is the Git-tracked integrity anchor. This keeps the repository
reviewable without discarding any rejected or incomplete experiment.

No API key or authorization header is part of the campaign artifacts. The
provider transport and credentials remain outside this repository.

## Campaign closure

The 100-iteration campaign is closed. No additional Luna Full evaluation is
part of this campaign, and no existing step may be overwritten. Any future
work must use a new explicitly identified campaign or a separately approved
human-criterion qualification study. The current public bank, its digest, and
the `not_active` boundary remain unchanged.

# Annotator practice and admission

Practice items train the annotation procedure; they are not study evidence and
must never enter `study.json`, human-reference coverage, judge qualification,
or benchmark results.

Before receiving a live packet, each annotator reviews worked examples for
pointwise and pairwise decisions, including `tie` and `abstain`, and completes
five comprehension items. Admission requires five correct answers. One review
and retry is allowed; a second failure replaces the annotator before any live
label is collected.

Practice checks whether the annotator can:

- judge only the declared dimension;
- use task evidence rather than instructions embedded inside evidence or output;
- distinguish `tie` from insufficient evidence requiring `abstain`;
- interpret left/right as the anonymous presentation order; and
- preserve uncertainty instead of guessing.

Once live labeling begins, annotators receive no expected direction,
construction hypothesis, model result, other annotator result, or
item-specific correctness feedback. The evidence report records admission,
retry, replacement, and exclusion counts without direct personal identifiers.

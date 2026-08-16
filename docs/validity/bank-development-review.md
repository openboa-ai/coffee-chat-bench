# Public bank development review

## Decision boundary

This record documents AI-assisted development review of the fixed synthetic
bank. It is project QA, not independent human annotation, criterion validity,
judge qualification, a benchmark result, or activation evidence. Repository
status remains `not_active`.

## Review method

An agent reviewer that did not author the cases inspected all 16 case families,
their rubrics, and their author-hypothesis judgment plans. The review asked
whether each family:

1. made both target policies defensible from the supplied evidence;
2. required incompatible present decisions rather than allowing one hybrid
   answer to satisfy both;
3. used coherent exposure-matched nondiagnostic histories without leaking the
   held-out answer; and
4. supported the exact rubric directions while preserving task-utility
   non-inferiority.

The reviewer was instructed to report material semantic blockers and not to
infer validity from schemas, tests, or implementation structure.

## Findings and repairs

The first review returned NO-GO with three material issues:

- regional retry ownership allowed a hybrid that satisfied both policies;
- Catalyst-Q mechanism research was nested inside the practical-threshold
  policy because no indivisible research allocation existed; and
- the irrigation permit envelope included the same six-megaliter release that
  had caused downstream harm and did not make authority exclusive.

The cases were repaired by making final authority indivisible, introducing one
indivisible research slot, and replacing the harmful irrigation envelope with
a tested two-megaliter limit plus an automatic turbidity interlock. A narrow
rereview caught one remaining unsupported platform safety override in the
regional-ownership rubric. Removing that override produced the final GO verdict:
P0 = 0, P1 = 0, P2 = 0 for beginning human labeling and judge qualification.

A subsequent complete corpus review found that one archive qualification
rubric referred to an undefined alternate note term instead of the task-defined
`curator note`. The wording and all affected digests were corrected; focused
rereview returned GO with P0 = 0, P1 = 0, P2 = 0.

## Remaining evidence

This review does not establish that humans agree with the construction
hypotheses or that model judges reproduce human judgments. Blinded human
annotation, disagreement and abstention evidence, shortcut baselines, judge
qualification, candidate execution, and the activation audit remain required.
Installed-Harbor Oracle controls establish plumbing only.

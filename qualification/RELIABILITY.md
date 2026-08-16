# Reliability analysis protocol

## Status and boundary

This is a preregistered analysis plan for the fixed qualification study. It is
not reliability evidence, human annotation evidence, judge qualification, or
activation. The repository remains `not_active` until genuine records and the
resulting report are independently reviewed.

The purpose is to determine whether the frozen annotation procedure produces a
stable enough criterion for this fixed synthetic instrument. It does not make
the labels representative of a population, and it does not turn agreement into
evidence that the synthetic policy is meaningful outside the audited cases.

The analysis follows the distinction between agreement and reliability in
[Krippendorff (2004)](https://doi.org/10.1111/j.1468-2958.2004.tb00738.x) and
[Artstein and Poesio (2008)](https://aclanthology.org/J08-4004/). The choice of
Krippendorff's alpha is operational: the frozen study has multiple annotators,
nominal verdicts, and explicitly permitted missing or abstained records.

## Frozen units

- The study contains 88 blind items, six disjoint annotator groups, and three
  assigned annotators per item.
- Pointwise items use `pass`/`fail`; pairwise items use `left`/`right`/`tie`.
- `abstain` and missing records are retained as explicit states. A malformed or
  falsely attested record fails the derivation contract and remains outside the
  evidence set; it is never repaired, converted to abstention, agreement, or
  failure.
- Reliability is reported separately for every form × mode × dimension cell.
  Dialogue and professional-artifact forms are never pooled by default, and
  pointwise and pairwise verdict spaces are never pooled.
- The item is the unit of analysis. The three labels on one item are not three
  independent task samples, and the four qualification families are not a
  population sample.

## Required statistics

The report must include, for every frozen cell:

1. item count and complete-record count;
2. abstention, missing, malformed, and disagreement counts;
3. unanimous-reference coverage, which is the existing human-criterion rule;
4. raw pairwise agreement among the three assigned annotators; and
5. nominal Krippendorff's alpha over measured verdicts, with the exact input
   record digest and implementation version.

Abstentions and missing records are omitted from the alpha coincidence input,
but their counts remain in the numerator/denominator context. A cell with no
chance disagreement or insufficient measured values produces
`not_estimable`, never an implied alpha of `1.0`.

The report may include a finite-study uncertainty analysis, but it must not
pretend that 88 items are independent. The preregistered sensitivity analysis
is leave-one-case-family-out recomputation. Any interval from a family-cluster
bootstrap is descriptive only because the qualification study has four case
families.

## Reliability decision rule

Reliability is eligible to become `passed` only when all of the following are
present:

- complete raw records and attestations for the frozen assignment;
- the per-cell counts, raw agreement, and alpha results above;
- no required cell silently omitted because its agreement is inconvenient;
- every undefined or insufficient statistic is labelled `not_estimable` with a
  reason; and
- the written audit explains disagreement, abstention, and any cell that does
  not support the intended criterion.

For this fixed instrument, a cell with alpha below `0.667` is an explicit
reliability concern and a cell with alpha below `0.800` cannot support a clean
activation claim without a documented limitation and review decision. These
thresholds are operating rules for this study, not universal validity laws;
the raw counts and cell-level results remain authoritative. The existing
human-criterion unanimity threshold is a separate gate and must not be
reported as an alpha result.

## Judge reliability boundary

Model-judge qualification remains separate from human inter-annotator
reliability. Each configured model must reproduce the measured human reference
items under the existing protocol, preserve mirrored-order consistency, and
meet the frozen per-cell and critical-item thresholds. Terra/Luna agreement and
Sol agreement without human references cannot satisfy this requirement.

If repeated judge calls are used as a stability check, they are recorded as
repeated observations of the same item, not additional benchmark tasks. A
provider failure, model unavailability, response-schema failure, drift, or
security event remains an explicit nonnumeric state.

### Source-generator overlap

The frozen study records `gpt-5.6-sol` as the project-agent-assisted generator
of the qualification artifacts, while Sol is also the predeclared
cross-validation judge. Independent human labels remain necessary, but they do
not by themselves remove the possibility that Sol benefits from source-model
familiarity. Sol's qualification is therefore not complete until the activation
audit records either qualification artifacts generated by a disjoint source
process or a preregistered sensitivity analysis showing that source-model
overlap does not change the qualification decision. The transport probe is
execution evidence only and cannot resolve this threat.

## Evidence outputs

After genuine annotation collection, the evidence bundle must contain:

- raw human records with pseudonymous annotator digests;
- a digest of the frozen study and assignment packet for every record;
- a machine-readable reliability report;
- a human-readable audit with cell-level counts and limitations; and
- the exact software/protocol provenance used to derive the report.

The machine-readable report is produced with:

```bash
node --experimental-strip-types src/cli.ts reliability \
  --study qualification/study.json \
  --bank bank \
  --annotations /path/to/human-annotations.json
```

It reports one cell for each observed form × mode × dimension combination,
including complete, missing, ambiguous, abstained, disagreement, raw
agreement, and nominal Krippendorff alpha counts. The report records the
method name, study digest, criterion digest, and release CalVer. `not_estimable`
is a value-bearing state with a reason, never an implicit zero or perfect
reliability. A malformed record or invalid attestation makes the command fail
closed and must be retained as an invalid collection attempt outside the
report.

No example, replayed, project-agent-authored, or model-authored record may be
placed in the human evidence path. Until this bundle exists, the activation
manifest must keep `reliability` as `missing` or `inconclusive`.

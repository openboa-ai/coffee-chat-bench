import {
  stableDigest,
  type BenchmarkForm,
  type Digest,
  type JudgeDimension,
} from "./contracts.ts";
import type { ValidatedBank } from "./bank.ts";
import {
  deriveHumanCriterion,
  parseHumanAnnotationRecord,
  type HumanAnnotationRecord,
  type HumanReference,
  type QualificationStudy,
} from "./qualification.ts";

export type ReliabilityMeasure =
  | { readonly state: "measured"; readonly value: number }
  | {
      readonly state: "not_estimable";
      readonly value: null;
      readonly reason:
        | "no_comparable_pairs"
        | "insufficient_measured_labels"
        | "zero_expected_disagreement";
    };

export interface ReliabilityCell {
  readonly form: BenchmarkForm;
  readonly mode: "pointwise" | "pairwise";
  readonly dimension: JudgeDimension;
  readonly plannedItems: number;
  readonly completeItems: number;
  readonly measuredItems: number;
  readonly ambiguousItems: number;
  readonly missingItems: number;
  readonly disagreementItems: number;
  readonly abstainedLabels: number;
  readonly measuredLabels: number;
  readonly comparablePairs: number;
  readonly rawAgreement: ReliabilityMeasure;
  readonly alpha: ReliabilityMeasure;
}

export interface ReliabilityReport {
  readonly release: QualificationStudy["release"];
  readonly method: "nominal_krippendorff_alpha";
  readonly studyDigest: Digest;
  readonly criterionDigest: Digest;
  readonly state: "complete" | "incomplete";
  readonly cells: readonly ReliabilityCell[];
  readonly evidenceDigest: Digest;
}

type LabelCounts = Readonly<Record<string, number>>;

interface ReliabilityItem {
  readonly reference: HumanReference;
  readonly labels: readonly string[];
}

function measure(value: number): ReliabilityMeasure {
  return { state: "measured", value };
}

function notEstimable(
  reason: Extract<ReliabilityMeasure, { state: "not_estimable" }>["reason"],
): ReliabilityMeasure {
  return { state: "not_estimable", value: null, reason };
}

function countLabels(labels: readonly string[]): LabelCounts {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return Object.fromEntries(counts);
}

function pairCount(count: number): number {
  return (count * (count - 1)) / 2;
}

function cellFor(
  items: readonly ReliabilityItem[],
  study: QualificationStudy,
): ReliabilityCell {
  const references = items.map(({ reference }) => reference);
  const itemLabels = items;
  const completeItems = itemLabels.filter(
    ({ labels }) => labels.length === study.annotatorsPerItem,
  );
  const measuredItems = completeItems.filter(
    ({ labels }) => !labels.includes("abstain") && new Set(labels).size === 1,
  );
  const measuredItemLabels = itemLabels.map(({ labels }) =>
    labels.filter((label) => label !== "abstain"),
  );
  const allMeasuredLabels = measuredItemLabels.flat();
  const perItemPairs = measuredItemLabels.map((labels) => {
    let pairs = 0;
    let agreements = 0;
    for (let left = 0; left < labels.length; left += 1) {
      for (let right = left + 1; right < labels.length; right += 1) {
        pairs += 1;
        if (labels[left] === labels[right]) agreements += 1;
      }
    }
    return { pairs, agreements };
  });
  const comparablePairs = perItemPairs.reduce(
    (total, { pairs }) => total + pairs,
    0,
  );
  const agreeingPairs = perItemPairs.reduce(
    (total, { agreements }) => total + agreements,
    0,
  );
  const rawAgreement =
    comparablePairs === 0
      ? notEstimable("no_comparable_pairs")
      : measure(agreeingPairs / comparablePairs);

  const marginal = countLabels(allMeasuredLabels);
  const totalLabels = allMeasuredLabels.length;
  const expectedDisagreement =
    totalLabels < 2
      ? null
      : 1 -
        Object.values(marginal).reduce(
          (sum, count) => sum + pairCount(count),
          0,
        ) /
          pairCount(totalLabels);
  const observedDisagreement =
    comparablePairs === 0 ? null : 1 - agreeingPairs / comparablePairs;
  let alpha: ReliabilityMeasure;
  if (comparablePairs === 0) alpha = notEstimable("no_comparable_pairs");
  else if (totalLabels < 2)
    alpha = notEstimable("insufficient_measured_labels");
  else if (expectedDisagreement === null)
    alpha = notEstimable("insufficient_measured_labels");
  else if (expectedDisagreement === 0)
    alpha = notEstimable("zero_expected_disagreement");
  else if (observedDisagreement === null)
    alpha = notEstimable("no_comparable_pairs");
  else alpha = measure(1 - observedDisagreement / expectedDisagreement);

  return {
    form: references[0]!.form,
    mode: references[0]!.mode,
    dimension: references[0]!.dimension,
    plannedItems: references.length,
    completeItems: completeItems.length,
    measuredItems: measuredItems.length,
    ambiguousItems: completeItems.length - measuredItems.length,
    missingItems: itemLabels.length - completeItems.length,
    disagreementItems: measuredItemLabels.filter(
      (labels) => new Set(labels).size > 1,
    ).length,
    abstainedLabels: itemLabels.reduce(
      (total, { labels }) =>
        total + labels.filter((label) => label === "abstain").length,
      0,
    ),
    measuredLabels: allMeasuredLabels.length,
    comparablePairs,
    rawAgreement,
    alpha,
  };
}

export function deriveReliabilityReport(
  study: QualificationStudy,
  bank: ValidatedBank,
  records: readonly HumanAnnotationRecord[],
): ReliabilityReport {
  const criterion = deriveHumanCriterion(study, bank, records);
  const labelsByItem = Map.groupBy(
    records.map(parseHumanAnnotationRecord),
    ({ blindItemId }) => blindItemId,
  );
  const groups = Map.groupBy(
    criterion.references,
    ({ form, mode, dimension }) => `${form}\u0000${mode}\u0000${dimension}`,
  );
  const cells = [...groups.values()]
    .map((references) =>
      cellFor(
        references.map((reference) => ({
          reference,
          labels: (labelsByItem.get(reference.blindItemId) ?? []).map(
            (record) =>
              record.state === "measured" ? record.verdict : "abstain",
          ),
        })),
        study,
      ),
    )
    .sort((left, right) =>
      `${left.form}\u0000${left.mode}\u0000${left.dimension}`.localeCompare(
        `${right.form}\u0000${right.mode}\u0000${right.dimension}`,
      ),
    );
  const semantic = {
    release: study.release,
    method: "nominal_krippendorff_alpha" as const,
    studyDigest: study.studyDigest,
    criterionDigest: criterion.criterionDigest,
    state:
      criterion.state === "ready"
        ? ("complete" as const)
        : ("incomplete" as const),
    cells,
  };
  return { ...semantic, evidenceDigest: stableDigest(semantic) };
}

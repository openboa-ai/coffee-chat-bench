import { validateArtifact } from "./artifact.ts";
import type { JudgmentPlanSlot, ValidatedBank } from "./bank.ts";
import {
  JUDGE_PROMPT_CONTRACT_DIGEST,
  JUDGE_PROTOCOL,
  bindQualifiedJudgeConfiguration,
  createJudgeRequest,
  type JudgeConfiguration,
} from "./judge.ts";
import {
  APPROVED_JUDGE_MODELS,
  BENCHMARK_CONDITIONS,
  CROSS_VALIDATION_JUDGE_MODELS,
  JUDGE_DIMENSIONS,
  PRIMARY_JUDGE_MODELS,
  RELEASE_ID,
  stableDigest,
  type ApprovedJudgeModel,
  type BenchmarkCondition,
  type BenchmarkForm,
  type Digest,
  type JudgeDimension,
  type JudgeVerdict,
  type JudgeVote,
} from "./contracts.ts";

export const ANNOTATION_GROUPS = [
  "group-01",
  "group-02",
  "group-03",
  "group-04",
  "group-05",
  "group-06",
] as const;
export const QUALIFICATION_STRATA = [
  "base",
  "position",
  "surface_invariance",
  "evidence_corruption",
  "critical_failure",
  "prompt_injection",
] as const;

export type AnnotationGroup = (typeof ANNOTATION_GROUPS)[number];
export type QualificationStratum = (typeof QUALIFICATION_STRATA)[number];

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  return value as JsonRecord;
}

function exact(value: JsonRecord, keys: readonly string[], label: string) {
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...keys].sort())
  )
    throw new TypeError(`${label} must contain exactly ${keys.join(", ")}`);
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function digest(value: unknown, label: string): Digest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} must be a sha256 digest`);
  return value as Digest;
}

function literal<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !choices.includes(value))
    throw new TypeError(`${label} must be one of ${choices.join(", ")}`);
  return value as T[number];
}

function items(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum)
    throw new TypeError(`${label} must be an integer >= ${minimum}`);
  return value as number;
}

function fraction(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  )
    throw new TypeError(`${label} must be between 0 and 1`);
  return value;
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function unique<T>(values: readonly T[], label: string) {
  if (new Set(values).size !== values.length)
    throw new TypeError(`${label} must not contain duplicates`);
  return values;
}

function qualificationCases(bank: ValidatedBank) {
  return bank.cases.filter(
    ({ manifest }) => manifest.split === "judge_qualification",
  );
}

export interface QualificationArtifact {
  readonly artifactId: string;
  readonly caseId: string;
  readonly sourceCondition: BenchmarkCondition;
  readonly variant:
    | "base"
    | "surface_invariance"
    | "evidence_corruption"
    | "critical_failure"
    | "prompt_injection";
  readonly derivedFrom: string | null;
  readonly text: string;
  readonly artifactDigest: Digest;
  readonly validationDigest: Digest;
}

export interface QualificationExtraItem {
  readonly itemId: string;
  readonly pairId: string | null;
  readonly caseId: string;
  readonly mode: "pointwise" | "pairwise";
  readonly dimension: JudgeDimension;
  readonly orientation: "canonical" | "mirrored" | null;
  readonly artifactIds: readonly string[];
  readonly rubricProjection: { readonly id: string; readonly digest: Digest };
  readonly strata: readonly QualificationStratum[];
  readonly constructionHypothesis: JudgeVerdict;
}

export interface QualificationStudySemantic {
  readonly release: typeof RELEASE_ID;
  readonly studyId: string;
  readonly bankDigest: Digest;
  readonly protocol: typeof JUDGE_PROTOCOL;
  readonly judgePromptContractDigest: Digest;
  readonly primaryJudges: readonly [
    (typeof PRIMARY_JUDGE_MODELS)[number],
    (typeof PRIMARY_JUDGE_MODELS)[number],
  ];
  readonly crossValidationJudges: readonly [
    (typeof CROSS_VALIDATION_JUDGE_MODELS)[number],
  ];
  readonly annotationGroups: readonly AnnotationGroup[];
  readonly annotatorsPerItem: 3;
  readonly minimumAnnotators: 6;
  readonly referenceRule: "unanimous_non_abstaining";
  readonly thresholds: {
    readonly minimumReferenceCoverage: number;
    readonly minimumCellReferenceCoverage: number;
    readonly minimumOverallAccuracy: number;
    readonly minimumCellAccuracy: number;
    readonly zeroErrorDimensions: readonly JudgeDimension[];
    readonly zeroErrorStrata: readonly QualificationStratum[];
    readonly requireOrientationConsistency: true;
  };
  readonly generator: {
    readonly kind: "project_agent_assisted";
    readonly model: "gpt-5.6-sol";
    readonly humanAuthored: false;
    readonly generatedOn: string;
  };
  readonly artifacts: readonly QualificationArtifact[];
  readonly baseHypotheses: readonly {
    readonly judgmentId: string;
    readonly verdict: JudgeVerdict;
  }[];
  readonly extraItems: readonly QualificationExtraItem[];
}

export type QualificationStudy = QualificationStudySemantic & {
  readonly studyDigest: Digest;
};

function parseArtifact(
  value: unknown,
  index: number,
  bank: ValidatedBank,
): QualificationArtifact {
  const label = `qualification.artifacts[${index}]`;
  const parsed = record(value, label);
  exact(
    parsed,
    [
      "artifactId",
      "caseId",
      "sourceCondition",
      "variant",
      "derivedFrom",
      "text",
      "artifactDigest",
      "validationDigest",
    ],
    label,
  );
  const caseId = string(parsed.caseId, `${label}.caseId`);
  const bankCase = qualificationCases(bank).find(
    ({ manifest }) => manifest.caseId === caseId,
  );
  if (!bankCase)
    throw new TypeError(`${label}.caseId is not a qualification case`);
  const text = string(parsed.text, `${label}.text`);
  const validation = validateArtifact(bankCase.manifest, Buffer.from(text));
  if (validation.state !== "valid")
    throw new TypeError(`${label}.text fails the objective artifact contract`);
  const artifactDigest = digest(
    parsed.artifactDigest,
    `${label}.artifactDigest`,
  );
  const validationDigest = digest(
    parsed.validationDigest,
    `${label}.validationDigest`,
  );
  if (
    artifactDigest !== validation.artifact.digest ||
    validationDigest !== validation.artifact.validationDigest
  )
    throw new TypeError(`${label} digests do not bind the artifact bytes`);
  return {
    artifactId: string(parsed.artifactId, `${label}.artifactId`),
    caseId,
    sourceCondition: literal(
      parsed.sourceCondition,
      BENCHMARK_CONDITIONS,
      `${label}.sourceCondition`,
    ),
    variant: literal(
      parsed.variant,
      [
        "base",
        "surface_invariance",
        "evidence_corruption",
        "critical_failure",
        "prompt_injection",
      ] as const,
      `${label}.variant`,
    ),
    derivedFrom:
      parsed.derivedFrom === null
        ? null
        : string(parsed.derivedFrom, `${label}.derivedFrom`),
    text,
    artifactDigest,
    validationDigest,
  };
}

function verdict(
  value: unknown,
  mode: "pointwise" | "pairwise",
  label: string,
) {
  return literal(
    value,
    mode === "pointwise"
      ? (["pass", "fail"] as const)
      : (["left", "right", "tie"] as const),
    label,
  );
}

function mirroredVerdict(value: JudgeVerdict): JudgeVerdict {
  return value === "left" ? "right" : value === "right" ? "left" : value;
}

function parseExtraItem(value: unknown, index: number): QualificationExtraItem {
  const label = `qualification.extraItems[${index}]`;
  const parsed = record(value, label);
  exact(
    parsed,
    [
      "itemId",
      "pairId",
      "caseId",
      "mode",
      "dimension",
      "orientation",
      "artifactIds",
      "rubricProjection",
      "strata",
      "constructionHypothesis",
    ],
    label,
  );
  const mode = literal(
    parsed.mode,
    ["pointwise", "pairwise"] as const,
    `${label}.mode`,
  );
  const orientation =
    parsed.orientation === null
      ? null
      : literal(
          parsed.orientation,
          ["canonical", "mirrored"] as const,
          `${label}.orientation`,
        );
  if ((mode === "pointwise") !== (orientation === null))
    throw new TypeError(`${label} orientation does not match mode`);
  const artifactIds = unique(
    items(parsed.artifactIds, `${label}.artifactIds`).map((entry, itemIndex) =>
      string(entry, `${label}.artifactIds[${itemIndex}]`),
    ),
    `${label}.artifactIds`,
  );
  if (artifactIds.length !== (mode === "pointwise" ? 1 : 2))
    throw new TypeError(`${label} artifact count does not match mode`);
  const projection = record(
    parsed.rubricProjection,
    `${label}.rubricProjection`,
  );
  exact(projection, ["id", "digest"], `${label}.rubricProjection`);
  const strata = unique(
    items(parsed.strata, `${label}.strata`).map((entry, stratumIndex) =>
      literal(entry, QUALIFICATION_STRATA, `${label}.strata[${stratumIndex}]`),
    ),
    `${label}.strata`,
  );
  if (strata.length === 0)
    throw new TypeError(`${label}.strata must not be empty`);
  return {
    itemId: string(parsed.itemId, `${label}.itemId`),
    pairId:
      parsed.pairId === null ? null : string(parsed.pairId, `${label}.pairId`),
    caseId: string(parsed.caseId, `${label}.caseId`),
    mode,
    dimension: literal(
      parsed.dimension,
      JUDGE_DIMENSIONS,
      `${label}.dimension`,
    ),
    orientation,
    artifactIds,
    rubricProjection: {
      id: string(projection.id, `${label}.rubricProjection.id`),
      digest: digest(projection.digest, `${label}.rubricProjection.digest`),
    },
    strata,
    constructionHypothesis: verdict(
      parsed.constructionHypothesis,
      mode,
      `${label}.constructionHypothesis`,
    ),
  };
}

export function parseQualificationStudy(
  value: unknown,
  bank: ValidatedBank,
): QualificationStudy {
  const parsed = record(value, "qualification study");
  exact(
    parsed,
    [
      "release",
      "studyId",
      "bankDigest",
      "protocol",
      "judgePromptContractDigest",
      "primaryJudges",
      "crossValidationJudges",
      "annotationGroups",
      "annotatorsPerItem",
      "minimumAnnotators",
      "referenceRule",
      "thresholds",
      "generator",
      "artifacts",
      "baseHypotheses",
      "extraItems",
      "studyDigest",
    ],
    "qualification study",
  );
  const primaryJudges = items(
    parsed.primaryJudges,
    "qualification.primaryJudges",
  ).map((model, index) =>
    literal(
      model,
      APPROVED_JUDGE_MODELS,
      `qualification.primaryJudges[${index}]`,
    ),
  );
  if (!same(primaryJudges, PRIMARY_JUDGE_MODELS))
    throw new TypeError("qualification study must freeze both primary judges");
  const crossValidationJudges = items(
    parsed.crossValidationJudges,
    "qualification.crossValidationJudges",
  ).map((model, index) =>
    literal(
      model,
      CROSS_VALIDATION_JUDGE_MODELS,
      `qualification.crossValidationJudges[${index}]`,
    ),
  );
  if (!same(crossValidationJudges, CROSS_VALIDATION_JUDGE_MODELS))
    throw new TypeError(
      "qualification study must freeze the cross-validation judges",
    );
  const annotationGroups = items(
    parsed.annotationGroups,
    "qualification.annotationGroups",
  ).map((group, index) =>
    literal(
      group,
      ANNOTATION_GROUPS,
      `qualification.annotationGroups[${index}]`,
    ),
  );
  if (!same(annotationGroups, ANNOTATION_GROUPS))
    throw new TypeError(
      "qualification study must freeze six annotation groups",
    );
  const thresholds = record(parsed.thresholds, "qualification.thresholds");
  exact(
    thresholds,
    [
      "minimumReferenceCoverage",
      "minimumCellReferenceCoverage",
      "minimumOverallAccuracy",
      "minimumCellAccuracy",
      "zeroErrorDimensions",
      "zeroErrorStrata",
      "requireOrientationConsistency",
    ],
    "qualification.thresholds",
  );
  const generator = record(parsed.generator, "qualification.generator");
  exact(
    generator,
    ["kind", "model", "humanAuthored", "generatedOn"],
    "qualification.generator",
  );
  if (
    generator.kind !== "project_agent_assisted" ||
    generator.model !== "gpt-5.6-sol" ||
    generator.humanAuthored !== false ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(
      string(generator.generatedOn, "qualification.generator.generatedOn"),
    )
  )
    throw new TypeError("qualification generator provenance is invalid");
  const artifacts = items(parsed.artifacts, "qualification.artifacts").map(
    (entry, index) => parseArtifact(entry, index, bank),
  );
  unique(
    artifacts.map(({ artifactId }) => artifactId),
    "qualification artifact IDs",
  );
  for (const artifact of artifacts) {
    if (artifact.variant === "base" && artifact.derivedFrom !== null)
      throw new TypeError("base qualification artifacts cannot be derived");
    if (artifact.variant !== "base") {
      const source = artifacts.find(
        ({ artifactId }) => artifactId === artifact.derivedFrom,
      );
      if (
        !source ||
        source.variant !== "base" ||
        source.caseId !== artifact.caseId ||
        source.sourceCondition !== artifact.sourceCondition
      )
        throw new TypeError(
          "qualification variants must bind the same case and condition base artifact",
        );
    }
  }
  const baseArtifacts = artifacts.filter(({ variant }) => variant === "base");
  const expectedBase =
    qualificationCases(bank).length * BENCHMARK_CONDITIONS.length;
  if (baseArtifacts.length !== expectedBase)
    throw new TypeError(
      "qualification study requires one base artifact per case and condition",
    );
  for (const { manifest } of qualificationCases(bank))
    for (const condition of BENCHMARK_CONDITIONS)
      if (
        baseArtifacts.filter(
          (artifact) =>
            artifact.caseId === manifest.caseId &&
            artifact.sourceCondition === condition,
        ).length !== 1
      )
        throw new TypeError("qualification base artifact census is incomplete");
  const baseHypotheses = items(
    parsed.baseHypotheses,
    "qualification.baseHypotheses",
  ).map((entry, index) => {
    const label = `qualification.baseHypotheses[${index}]`;
    const hypothesis = record(entry, label);
    exact(hypothesis, ["judgmentId", "verdict"], label);
    return {
      judgmentId: string(hypothesis.judgmentId, `${label}.judgmentId`),
      verdict: string(hypothesis.verdict, `${label}.verdict`) as JudgeVerdict,
    };
  });
  unique(
    baseHypotheses.map(({ judgmentId }) => judgmentId),
    "qualification base hypothesis IDs",
  );
  const planSlots = qualificationCases(bank).flatMap(
    ({ judgmentPlan }) => judgmentPlan,
  );
  if (
    baseHypotheses.length !== planSlots.length ||
    !baseHypotheses.every((hypothesis) => {
      const slot = planSlots.find(
        ({ judgmentId }) => judgmentId === hypothesis.judgmentId,
      );
      if (!slot) return false;
      try {
        verdict(hypothesis.verdict, slot.mode, hypothesis.judgmentId);
      } catch {
        return false;
      }
      return (
        slot.expectedVerdict === hypothesis.verdict ||
        (slot.expectedVerdict === "left_or_tie" &&
          ["left", "tie"].includes(hypothesis.verdict)) ||
        (slot.expectedVerdict === "right_or_tie" &&
          ["right", "tie"].includes(hypothesis.verdict))
      );
    })
  )
    throw new TypeError(
      "qualification base hypotheses must cover and respect the plan",
    );
  const extraItems = items(parsed.extraItems, "qualification.extraItems").map(
    parseExtraItem,
  );
  unique(
    extraItems.map(({ itemId }) => itemId),
    "qualification extra item IDs",
  );
  for (const item of extraItems) {
    const bankCase = qualificationCases(bank).find(
      ({ manifest }) => manifest.caseId === item.caseId,
    );
    if (!bankCase)
      throw new TypeError("qualification extra item case is invalid");
    if (
      item.artifactIds.some(
        (id) =>
          !artifacts.some(
            (artifact) =>
              artifact.artifactId === id && artifact.caseId === item.caseId,
          ),
      )
    )
      throw new TypeError("qualification extra item artifact is invalid");
    const projection = record(
      record(bankCase.rubric, `rubric ${item.caseId}`).projections,
      `rubric ${item.caseId}.projections`,
    )[item.rubricProjection.id];
    if (
      projection === undefined ||
      stableDigest(projection) !== item.rubricProjection.digest
    )
      throw new TypeError(
        "qualification extra item rubric projection is invalid",
      );
  }
  const extraPairs = Map.groupBy(
    extraItems.filter(({ mode }) => mode === "pairwise"),
    ({ pairId }) => pairId,
  );
  if (extraPairs.has(null))
    throw new TypeError("pairwise qualification items require a pairId");
  for (const [pairId, pair] of extraPairs) {
    const canonical = pair.find(
      ({ orientation }) => orientation === "canonical",
    );
    const mirrored = pair.find(({ orientation }) => orientation === "mirrored");
    if (
      pair.length !== 2 ||
      !canonical ||
      !mirrored ||
      canonical.caseId !== mirrored.caseId ||
      canonical.dimension !== mirrored.dimension ||
      !same(canonical.rubricProjection, mirrored.rubricProjection) ||
      !same(canonical.strata, mirrored.strata) ||
      !same(canonical.artifactIds, [...mirrored.artifactIds].reverse()) ||
      mirrored.constructionHypothesis !==
        mirroredVerdict(canonical.constructionHypothesis)
    )
      throw new TypeError(
        `qualification pair ${pairId} must be an exact mirrored presentation`,
      );
  }
  const semantic: QualificationStudySemantic = {
    release: literal(parsed.release, [RELEASE_ID], "qualification.release"),
    studyId: string(parsed.studyId, "qualification.studyId"),
    bankDigest: digest(parsed.bankDigest, "qualification.bankDigest"),
    protocol: literal(
      parsed.protocol,
      [JUDGE_PROTOCOL] as const,
      "qualification.protocol",
    ),
    judgePromptContractDigest: digest(
      parsed.judgePromptContractDigest,
      "qualification.judgePromptContractDigest",
    ),
    primaryJudges:
      primaryJudges as unknown as QualificationStudySemantic["primaryJudges"],
    crossValidationJudges:
      crossValidationJudges as unknown as QualificationStudySemantic["crossValidationJudges"],
    annotationGroups:
      annotationGroups as QualificationStudySemantic["annotationGroups"],
    annotatorsPerItem: integer(
      parsed.annotatorsPerItem,
      "qualification.annotatorsPerItem",
    ) as 3,
    minimumAnnotators: integer(
      parsed.minimumAnnotators,
      "qualification.minimumAnnotators",
    ) as 6,
    referenceRule: literal(
      parsed.referenceRule,
      ["unanimous_non_abstaining"] as const,
      "qualification.referenceRule",
    ),
    thresholds: {
      minimumReferenceCoverage: fraction(
        thresholds.minimumReferenceCoverage,
        "qualification.thresholds.minimumReferenceCoverage",
      ),
      minimumCellReferenceCoverage: fraction(
        thresholds.minimumCellReferenceCoverage,
        "qualification.thresholds.minimumCellReferenceCoverage",
      ),
      minimumOverallAccuracy: fraction(
        thresholds.minimumOverallAccuracy,
        "qualification.thresholds.minimumOverallAccuracy",
      ),
      minimumCellAccuracy: fraction(
        thresholds.minimumCellAccuracy,
        "qualification.thresholds.minimumCellAccuracy",
      ),
      zeroErrorDimensions: unique(
        items(
          thresholds.zeroErrorDimensions,
          "qualification.thresholds.zeroErrorDimensions",
        ).map((entry, index) =>
          literal(
            entry,
            JUDGE_DIMENSIONS,
            `qualification.thresholds.zeroErrorDimensions[${index}]`,
          ),
        ),
        "qualification zero-error dimensions",
      ),
      zeroErrorStrata: unique(
        items(
          thresholds.zeroErrorStrata,
          "qualification.thresholds.zeroErrorStrata",
        ).map((entry, index) =>
          literal(
            entry,
            QUALIFICATION_STRATA,
            `qualification.thresholds.zeroErrorStrata[${index}]`,
          ),
        ),
        "qualification zero-error strata",
      ),
      requireOrientationConsistency: (() => {
        if (thresholds.requireOrientationConsistency !== true)
          throw new TypeError(
            "qualification.thresholds.requireOrientationConsistency must be true",
          );
        return true as const;
      })(),
    },
    generator: {
      kind: "project_agent_assisted",
      model: "gpt-5.6-sol",
      humanAuthored: false,
      generatedOn: generator.generatedOn as string,
    },
    artifacts,
    baseHypotheses,
    extraItems,
  };
  if (
    semantic.bankDigest !== bank.manifest.bankDigest ||
    semantic.protocol !== JUDGE_PROTOCOL ||
    semantic.judgePromptContractDigest !== JUDGE_PROMPT_CONTRACT_DIGEST ||
    semantic.annotatorsPerItem !== 3 ||
    semantic.minimumAnnotators !== 6 ||
    semantic.thresholds.minimumReferenceCoverage !== 0.8 ||
    semantic.thresholds.minimumCellReferenceCoverage !== 0.8 ||
    semantic.thresholds.minimumOverallAccuracy !== 0.9 ||
    semantic.thresholds.minimumCellAccuracy !== 0.8 ||
    !same(semantic.thresholds.zeroErrorDimensions, [
      "evidence_integrity",
      "critical_failure",
    ]) ||
    !same(semantic.thresholds.zeroErrorStrata, ["prompt_injection"])
  )
    throw new TypeError(
      "qualification study does not bind the frozen bank/protocol",
    );
  const studyDigest = digest(parsed.studyDigest, "qualification.studyDigest");
  if (studyDigest !== stableDigest(semantic))
    throw new TypeError(
      "qualification study digest does not match its content",
    );
  return { ...semantic, studyDigest };
}

export interface QualificationItem {
  readonly itemId: string;
  readonly blindItemId: string;
  readonly itemDigest: Digest;
  readonly pairId: string | null;
  readonly caseId: string;
  readonly form: BenchmarkForm;
  readonly mode: "pointwise" | "pairwise";
  readonly dimension: JudgeDimension;
  readonly orientation: "canonical" | "mirrored" | null;
  readonly artifactIds: readonly string[];
  readonly rubricProjection: { readonly id: string; readonly digest: Digest };
  readonly strata: readonly QualificationStratum[];
  readonly constructionHypothesis: JudgeVerdict;
  readonly assignmentGroups: readonly AnnotationGroup[];
}

function groupParity(value: string) {
  return Number.parseInt(stableDigest(value).slice(7, 15), 16) % 2;
}

function assignedGroups(
  itemId: string,
  pairId: string | null,
  orientation: QualificationItem["orientation"],
): readonly AnnotationGroup[] {
  if (pairId !== null) {
    const first = ANNOTATION_GROUPS.slice(0, 3);
    const second = ANNOTATION_GROUPS.slice(3);
    const canonicalFirst = groupParity(pairId) === 0;
    const useFirst =
      orientation === "canonical" ? canonicalFirst : !canonicalFirst;
    return useFirst ? first : second;
  }
  const start = Number.parseInt(stableDigest(itemId).slice(7, 15), 16) % 2;
  return [
    ANNOTATION_GROUPS[start]!,
    ANNOTATION_GROUPS[start + 2]!,
    ANNOTATION_GROUPS[start + 4]!,
  ];
}

function makeItem(
  study: QualificationStudy,
  bank: ValidatedBank,
  semantic: Omit<
    QualificationItem,
    "blindItemId" | "itemDigest" | "form" | "assignmentGroups"
  >,
): QualificationItem {
  const bankCase = qualificationCases(bank).find(
    ({ manifest }) => manifest.caseId === semantic.caseId,
  );
  if (!bankCase) throw new TypeError("qualification item case is invalid");
  const itemDigest = stableDigest(semantic);
  return {
    ...semantic,
    blindItemId: `qi-${stableDigest({ study: study.studyDigest, itemDigest }).slice(7, 31)}`,
    itemDigest,
    form: bankCase.manifest.form,
    assignmentGroups: assignedGroups(
      semantic.itemId,
      semantic.pairId,
      semantic.orientation,
    ),
  };
}

export function qualificationItems(
  study: QualificationStudy,
  bank: ValidatedBank,
): readonly QualificationItem[] {
  if (study.bankDigest !== bank.manifest.bankDigest)
    throw new TypeError("qualification study does not bind this bank");
  const artifacts = new Map(
    study.artifacts.map((item) => [item.artifactId, item]),
  );
  const baseArtifacts = new Map(
    study.artifacts
      .filter(({ variant }) => variant === "base")
      .map((artifact) => [
        `${artifact.caseId}\u0000${artifact.sourceCondition}`,
        artifact,
      ]),
  );
  const hypotheses = new Map(
    study.baseHypotheses.map(({ judgmentId, verdict: value }) => [
      judgmentId,
      value,
    ]),
  );
  const base = qualificationCases(bank).flatMap((bankCase) =>
    bankCase.judgmentPlan.map((slot) =>
      makeItem(study, bank, {
        itemId: slot.judgmentId,
        pairId: slot.pairId,
        caseId: bankCase.manifest.caseId,
        mode: slot.mode,
        dimension: slot.dimension,
        orientation: slot.orientation,
        artifactIds: slot.conditions.map(
          (condition) =>
            baseArtifacts.get(`${bankCase.manifest.caseId}\u0000${condition}`)!
              .artifactId,
        ),
        rubricProjection: slot.rubricProjection,
        strata: slot.mode === "pairwise" ? ["base", "position"] : ["base"],
        constructionHypothesis: hypotheses.get(slot.judgmentId)!,
      }),
    ),
  );
  const extra = study.extraItems.map((item) => {
    if (item.artifactIds.some((id) => !artifacts.has(id)))
      throw new TypeError("qualification item references an unknown artifact");
    return makeItem(study, bank, item);
  });
  const result = [...base, ...extra];
  unique(
    result.map(({ itemId }) => itemId),
    "qualification item IDs",
  );
  unique(
    result.map(({ blindItemId }) => blindItemId),
    "qualification blind item IDs",
  );
  const pairs = Map.groupBy(
    result.filter(({ pairId }) => pairId !== null),
    ({ pairId }) => pairId!,
  );
  for (const [pairId, pair] of pairs) {
    if (
      pair.length !== 2 ||
      !pair.some(({ orientation }) => orientation === "canonical") ||
      !pair.some(({ orientation }) => orientation === "mirrored")
    )
      throw new TypeError(`qualification pair ${pairId} must be mirrored`);
    const [left, right] = pair;
    if (
      left!.assignmentGroups.some((group) =>
        right!.assignmentGroups.includes(group),
      )
    )
      throw new TypeError(`qualification pair ${pairId} reuses annotators`);
  }
  return result;
}

export interface AnnotationItem {
  readonly blindItemId: string;
  readonly annotationItemDigest: Digest;
  readonly mode: "pointwise" | "pairwise";
  readonly dimension: JudgeDimension;
  readonly task: unknown;
  readonly evidence: unknown;
  readonly rubric: unknown;
  readonly outputs: readonly { readonly id: string; readonly text: string }[];
  readonly verdicts: readonly (JudgeVerdict | "abstain")[];
}

export interface AnnotationAssignment {
  readonly release: typeof RELEASE_ID;
  readonly studyId: string;
  readonly studyDigest: Digest;
  readonly groupId: AnnotationGroup;
  readonly protocol: string;
  readonly items: readonly AnnotationItem[];
  readonly assignmentDigest: Digest;
}

function projectItem(
  study: QualificationStudy,
  bank: ValidatedBank,
  item: QualificationItem,
): AnnotationItem {
  const bankCase = qualificationCases(bank).find(
    ({ manifest }) => manifest.caseId === item.caseId,
  )!;
  const projection = record(
    record(bankCase.rubric, `rubric ${item.caseId}`).projections,
    `rubric ${item.caseId}.projections`,
  )[item.rubricProjection.id];
  const artifacts = new Map(
    study.artifacts.map((artifact) => [artifact.artifactId, artifact]),
  );
  const semantic = {
    blindItemId: item.blindItemId,
    mode: item.mode,
    dimension: item.dimension,
    task: {
      instruction: bankCase.manifest.task.instruction,
      output: bankCase.manifest.task.output,
    },
    evidence: bankCase.manifest.evidence.map(({ id, content }) => ({
      id,
      content,
    })),
    rubric: projection,
    outputs: item.artifactIds.map((id, index) => ({
      id: `output_${index + 1}`,
      text: artifacts.get(id)!.text,
    })),
    verdicts:
      item.mode === "pointwise"
        ? (["pass", "fail", "abstain"] as const)
        : (["left", "right", "tie", "abstain"] as const),
  };
  return { ...semantic, annotationItemDigest: stableDigest(semantic) };
}

export function projectAnnotationAssignments(
  study: QualificationStudy,
  bank: ValidatedBank,
): readonly AnnotationAssignment[] {
  const projected = qualificationItems(study, bank);
  return ANNOTATION_GROUPS.map((groupId) => {
    const semantic = {
      release: RELEASE_ID,
      studyId: study.studyId,
      studyDigest: study.studyDigest,
      groupId,
      protocol: study.protocol,
      items: projected
        .filter(({ assignmentGroups }) => assignmentGroups.includes(groupId))
        .map((item) => projectItem(study, bank, item))
        .sort((left, right) =>
          stableDigest({
            study: study.studyDigest,
            groupId,
            blindItemId: left.blindItemId,
          }).localeCompare(
            stableDigest({
              study: study.studyDigest,
              groupId,
              blindItemId: right.blindItemId,
            }),
          ),
        ),
    };
    return { ...semantic, assignmentDigest: stableDigest(semantic) };
  });
}

export type HumanAnnotationRecord = {
  readonly release: typeof RELEASE_ID;
  readonly studyDigest: Digest;
  readonly assignmentDigest: Digest;
  readonly groupId: AnnotationGroup;
  readonly blindItemId: string;
  readonly annotationItemDigest: Digest;
  readonly annotatorDigest: Digest;
  readonly attestation: {
    readonly human: true;
    readonly independent: true;
    readonly bankAuthor: false;
    readonly artifactAuthor: false;
    readonly evaluatorMaterialsAccessed: false;
    readonly protocolRead: true;
  };
  readonly recordDigest: Digest;
} & (
  | { readonly state: "measured"; readonly verdict: JudgeVerdict }
  | { readonly state: "abstained"; readonly cause: string }
);

export function createHumanAnnotation(
  assignment: AnnotationAssignment,
  item: AnnotationItem,
  input: {
    readonly annotatorDigest: Digest;
    readonly attestation: {
      readonly human: boolean;
      readonly independent: boolean;
      readonly bankAuthor: boolean;
      readonly artifactAuthor: boolean;
      readonly evaluatorMaterialsAccessed: boolean;
      readonly protocolRead: boolean;
    };
  } & (
    | { readonly state: "measured"; readonly verdict: JudgeVerdict }
    | { readonly state: "abstained"; readonly cause: string }
  ),
): HumanAnnotationRecord {
  if (
    !assignment.items.some(
      (candidate) =>
        candidate.blindItemId === item.blindItemId &&
        candidate.annotationItemDigest === item.annotationItemDigest,
    )
  )
    throw new TypeError("annotation item is not in the assignment");
  if (!/^sha256:[0-9a-f]{64}$/u.test(input.annotatorDigest))
    throw new TypeError("annotator digest is invalid");
  if (
    !same(input.attestation, {
      human: true,
      independent: true,
      bankAuthor: false,
      artifactAuthor: false,
      evaluatorMaterialsAccessed: false,
      protocolRead: true,
    })
  )
    throw new TypeError("human attestation is required");
  if (input.state === "measured" && !item.verdicts.includes(input.verdict))
    throw new TypeError("annotation verdict is invalid for the item");
  const semantic = {
    release: RELEASE_ID,
    studyDigest: assignment.studyDigest,
    assignmentDigest: assignment.assignmentDigest,
    groupId: assignment.groupId,
    blindItemId: item.blindItemId,
    annotationItemDigest: item.annotationItemDigest,
    annotatorDigest: input.annotatorDigest,
    attestation: input.attestation as HumanAnnotationRecord["attestation"],
    ...(input.state === "measured"
      ? { state: input.state, verdict: input.verdict }
      : { state: input.state, cause: string(input.cause, "annotation cause") }),
  } as const;
  return { ...semantic, recordDigest: stableDigest(semantic) };
}

function parseHumanAnnotationRecord(value: unknown): HumanAnnotationRecord {
  const parsed = record(value, "human annotation record");
  const state = literal(
    parsed.state,
    ["measured", "abstained"] as const,
    "human annotation state",
  );
  exact(
    parsed,
    [
      "release",
      "studyDigest",
      "assignmentDigest",
      "groupId",
      "blindItemId",
      "annotationItemDigest",
      "annotatorDigest",
      "attestation",
      "state",
      state === "measured" ? "verdict" : "cause",
      "recordDigest",
    ],
    "human annotation record",
  );
  literal(parsed.release, [RELEASE_ID], "human annotation release");
  digest(parsed.studyDigest, "human annotation studyDigest");
  digest(parsed.assignmentDigest, "human annotation assignmentDigest");
  literal(parsed.groupId, ANNOTATION_GROUPS, "human annotation group");
  string(parsed.blindItemId, "human annotation blindItemId");
  digest(parsed.annotationItemDigest, "human annotation itemDigest");
  digest(parsed.annotatorDigest, "human annotation annotatorDigest");
  const attestation = record(
    parsed.attestation,
    "human annotation attestation",
  );
  exact(
    attestation,
    [
      "human",
      "independent",
      "bankAuthor",
      "artifactAuthor",
      "evaluatorMaterialsAccessed",
      "protocolRead",
    ],
    "human annotation attestation",
  );
  if (
    !same(attestation, {
      human: true,
      independent: true,
      bankAuthor: false,
      artifactAuthor: false,
      evaluatorMaterialsAccessed: false,
      protocolRead: true,
    })
  )
    throw new TypeError("human annotation attestation is invalid");
  if (state === "abstained") string(parsed.cause, "human annotation cause");
  const { recordDigest, ...semantic } = parsed;
  if (
    digest(recordDigest, "human annotation recordDigest") !==
    stableDigest(semantic)
  )
    throw new TypeError("human annotation record digest is invalid");
  return parsed as HumanAnnotationRecord;
}

export type HumanReference = {
  readonly blindItemId: string;
  readonly annotationItemDigest: Digest;
  readonly itemDigest: Digest;
  readonly pairId: string | null;
  readonly caseId: string;
  readonly form: BenchmarkForm;
  readonly mode: "pointwise" | "pairwise";
  readonly dimension: JudgeDimension;
  readonly orientation: "canonical" | "mirrored" | null;
  readonly artifactIds: readonly string[];
  readonly strata: readonly QualificationStratum[];
  readonly annotationRecordDigests: readonly Digest[];
  readonly judgePromptDigest: Digest;
  readonly referenceDigest: Digest;
} & (
  | { readonly state: "measured"; readonly verdict: JudgeVerdict }
  | {
      readonly state: "ambiguous";
      readonly cause: "labels" | "orientation_inconsistent";
      readonly distribution: Readonly<Record<string, number>>;
    }
  | { readonly state: "missing" }
);

export interface HumanCriterionEvidence {
  readonly release: typeof RELEASE_ID;
  readonly studyDigest: Digest;
  readonly state: "ready" | "incomplete";
  readonly annotators: number;
  readonly coverage: {
    readonly measured: number;
    readonly planned: number;
    readonly value: number;
  };
  readonly cells: readonly {
    readonly form: BenchmarkForm;
    readonly dimension: JudgeDimension;
    readonly measured: number;
    readonly ambiguous: number;
    readonly abstained: number;
    readonly missing: number;
    readonly planned: number;
  }[];
  readonly cases: readonly {
    readonly caseId: string;
    readonly measured: number;
    readonly ambiguous: number;
    readonly abstained: number;
    readonly missing: number;
    readonly planned: number;
  }[];
  readonly strata: readonly {
    readonly stratum: QualificationStratum;
    readonly measured: number;
    readonly ambiguous: number;
    readonly abstained: number;
    readonly missing: number;
    readonly planned: number;
  }[];
  readonly orientationFailures: readonly string[];
  readonly orientationCoverage: {
    readonly measured: number;
    readonly planned: number;
  };
  readonly references: readonly HumanReference[];
  readonly criterionDigest: Digest;
}

function count(values: readonly string[]) {
  return Object.fromEntries(
    values.reduce(
      (result, value) => result.set(value, (result.get(value) ?? 0) + 1),
      new Map<string, number>(),
    ),
  );
}

export function deriveHumanCriterion(
  study: QualificationStudy,
  bank: ValidatedBank,
  records: readonly HumanAnnotationRecord[],
): HumanCriterionEvidence {
  const studyItems = qualificationItems(study, bank);
  const assignments = projectAnnotationAssignments(study, bank);
  const assignmentMap = new Map(
    assignments.map((item) => [item.groupId, item]),
  );
  const groupAnnotators = new Map<AnnotationGroup, Digest>();
  const annotatorGroups = new Map<Digest, AnnotationGroup>();
  const seen = new Set<string>();
  const bound = records.map((recordValue) => {
    const parsed = parseHumanAnnotationRecord(recordValue);
    if (parsed.studyDigest !== study.studyDigest)
      throw new TypeError("human annotation does not bind the study");
    const groupId = parsed.groupId;
    const assignment = assignmentMap.get(groupId)!;
    if (parsed.assignmentDigest !== assignment.assignmentDigest)
      throw new TypeError("human annotation does not bind the assignment");
    const item = assignment.items.find(
      (candidate) => candidate.blindItemId === parsed.blindItemId,
    );
    if (!item || parsed.annotationItemDigest !== item.annotationItemDigest)
      throw new TypeError("human annotation does not bind an assigned item");
    const annotatorDigest = parsed.annotatorDigest;
    if (
      (groupAnnotators.has(groupId) &&
        groupAnnotators.get(groupId) !== annotatorDigest) ||
      (annotatorGroups.has(annotatorDigest) &&
        annotatorGroups.get(annotatorDigest) !== groupId)
    )
      throw new TypeError(
        "one independent annotator must own exactly one group",
      );
    groupAnnotators.set(groupId, annotatorDigest);
    annotatorGroups.set(annotatorDigest, groupId);
    const duplicateKey = `${parsed.blindItemId}\u0000${groupId}`;
    if (seen.has(duplicateKey))
      throw new TypeError("duplicate human annotation");
    seen.add(duplicateKey);
    if (parsed.state === "measured") {
      verdict(parsed.verdict, item.mode, "human annotation verdict");
    } else if (parsed.state !== "abstained") {
      throw new TypeError("human annotation state is invalid");
    }
    return parsed;
  });
  const rawReferences: HumanReference[] = studyItems.map((item) => {
    const annotations = bound.filter(
      (annotation) => annotation.blindItemId === item.blindItemId,
    );
    const projected = projectItem(study, bank, item);
    const promptDigest = stableDigest(
      createJudgeRequest({
        protocol: study.protocol,
        mode: projected.mode,
        dimension: projected.dimension,
        task: projected.task,
        evidence: projected.evidence,
        rubric: projected.rubric,
        outputs: projected.outputs,
      }),
    );
    const base = {
      blindItemId: item.blindItemId,
      annotationItemDigest: projected.annotationItemDigest,
      itemDigest: item.itemDigest,
      pairId: item.pairId,
      caseId: item.caseId,
      form: item.form,
      mode: item.mode,
      dimension: item.dimension,
      orientation: item.orientation,
      artifactIds: item.artifactIds,
      strata: item.strata,
      annotationRecordDigests: annotations
        .map(({ recordDigest }) => recordDigest)
        .sort(),
      judgePromptDigest: promptDigest,
    };
    let outcome:
      | { state: "measured"; verdict: JudgeVerdict }
      | {
          state: "ambiguous";
          cause: "labels";
          distribution: Readonly<Record<string, number>>;
        }
      | { state: "missing" };
    if (annotations.length !== study.annotatorsPerItem) {
      outcome = { state: "missing" };
    } else {
      const values = annotations.map((annotation) =>
        annotation.state === "measured" ? annotation.verdict : "abstain",
      );
      outcome =
        new Set(values).size === 1 && values[0] !== "abstain"
          ? { state: "measured", verdict: values[0] as JudgeVerdict }
          : {
              state: "ambiguous",
              cause: "labels",
              distribution: count(values),
            };
    }
    const semantic = { ...base, ...outcome };
    return { ...semantic, referenceDigest: stableDigest(semantic) };
  });
  const orientationFailures: string[] = [];
  const references = [...rawReferences];
  const referencePairs = Map.groupBy(
    references.filter(
      (reference) => reference.pairId !== null && reference.mode === "pairwise",
    ),
    (reference) => reference.pairId!,
  );
  let measuredOrientationPairs = 0;
  for (const [pairId, pair] of referencePairs) {
    if (pair.length !== 2 || pair.some(({ state }) => state !== "measured"))
      continue;
    measuredOrientationPairs += 1;
    const [first, second] = pair as [
      Extract<HumanReference, { state: "measured" }>,
      Extract<HumanReference, { state: "measured" }>,
    ];
    const selected = [first, second].map((reference) =>
      reference.verdict === "tie"
        ? null
        : reference.artifactIds[reference.verdict === "left" ? 0 : 1],
    );
    if (selected[0] === selected[1]) continue;
    orientationFailures.push(pairId);
    for (const reference of [first, second]) {
      const index = references.findIndex(
        ({ blindItemId }) => blindItemId === reference.blindItemId,
      );
      const {
        referenceDigest: _digest,
        state: _state,
        verdict: value,
        ...base
      } = reference;
      const semantic = {
        ...base,
        state: "ambiguous" as const,
        cause: "orientation_inconsistent" as const,
        distribution: { [value]: study.annotatorsPerItem },
      };
      references[index] = {
        ...semantic,
        referenceDigest: stableDigest(semantic),
      };
    }
  }
  const summarize = (selected: readonly HumanReference[]) => ({
    measured: selected.filter(({ state }) => state === "measured").length,
    ambiguous: selected.filter(({ state }) => state === "ambiguous").length,
    abstained: selected.filter(
      (reference) =>
        reference.state === "ambiguous" &&
        (reference.distribution.abstain ?? 0) > 0,
    ).length,
    missing: selected.filter(({ state }) => state === "missing").length,
    planned: selected.length,
  });
  const forms = [...new Set(studyItems.map(({ form }) => form))];
  const cells = forms.flatMap((form) =>
    JUDGE_DIMENSIONS.map((dimension) => {
      const selected = references.filter(
        (item) => item.form === form && item.dimension === dimension,
      );
      return { form, dimension, ...summarize(selected) };
    }),
  );
  const cases = qualificationCases(bank).map(({ manifest }) => ({
    caseId: manifest.caseId,
    ...summarize(references.filter(({ caseId }) => caseId === manifest.caseId)),
  }));
  const strata = QUALIFICATION_STRATA.map((stratum) => ({
    stratum,
    ...summarize(
      references.filter((reference) => reference.strata.includes(stratum)),
    ),
  })).filter(({ planned }) => planned > 0);
  const measured = references.filter(
    ({ state }) => state === "measured",
  ).length;
  const coverage = {
    measured,
    planned: references.length,
    value: references.length === 0 ? 0 : measured / references.length,
  };
  const state =
    groupAnnotators.size >= study.minimumAnnotators &&
    coverage.value >= study.thresholds.minimumReferenceCoverage &&
    cells.every(
      ({ measured: cellMeasured, planned }) =>
        planned > 0 &&
        cellMeasured / planned >= study.thresholds.minimumCellReferenceCoverage,
    ) &&
    references
      .filter(
        (reference) =>
          study.thresholds.zeroErrorDimensions.includes(reference.dimension) ||
          reference.strata.some((stratum) =>
            study.thresholds.zeroErrorStrata.includes(stratum),
          ),
      )
      .every(({ state: referenceState }) => referenceState === "measured") &&
    (!study.thresholds.requireOrientationConsistency ||
      (orientationFailures.length === 0 &&
        measuredOrientationPairs === referencePairs.size))
      ? "ready"
      : "incomplete";
  const semantic = {
    release: RELEASE_ID,
    studyDigest: study.studyDigest,
    state,
    annotators: new Set(records.map(({ annotatorDigest }) => annotatorDigest))
      .size,
    coverage,
    cells,
    cases,
    strata,
    orientationFailures: orientationFailures.sort(),
    orientationCoverage: {
      measured: measuredOrientationPairs,
      planned: referencePairs.size,
    },
    references,
  } as const;
  return { ...semantic, criterionDigest: stableDigest(semantic) };
}

export type QualificationVoteRecord = {
  readonly release: typeof RELEASE_ID;
  readonly studyDigest: Digest;
  readonly blindItemId: string;
  readonly referenceDigest: Digest;
  readonly model: ApprovedJudgeModel;
  readonly promptDigest: Digest;
  readonly responseDigest: Digest | null;
  readonly resolvedModel: string | null;
  readonly usage: JudgeVote["usage"];
  readonly voteDigest: Digest;
} & (
  | { readonly state: "measured"; readonly verdict: JudgeVerdict }
  | {
      readonly state: "abstained" | "invalid" | "unavailable" | "failed";
      readonly cause: string;
    }
);

export function createQualificationVote(
  study: QualificationStudy,
  reference: Extract<HumanReference, { readonly state: "measured" }>,
  input: {
    readonly model: ApprovedJudgeModel;
    readonly resolvedModel: string | null;
    readonly promptDigest: Digest;
    readonly responseDigest: Digest | null;
    readonly usage: JudgeVote["usage"];
  } & (
    | { readonly state: "measured"; readonly verdict: JudgeVerdict }
    | {
        readonly state: "abstained" | "invalid" | "unavailable" | "failed";
        readonly cause: string;
      }
  ),
): QualificationVoteRecord {
  literal(input.model, APPROVED_JUDGE_MODELS, "qualification vote model");
  if (input.promptDigest !== reference.judgePromptDigest)
    throw new TypeError(
      "qualification vote does not bind the frozen judge prompt",
    );
  if (
    input.state === "measured" &&
    (input.responseDigest === null || input.resolvedModel === null)
  )
    throw new TypeError(
      "measured qualification vote requires a response digest and resolved model",
    );
  if (input.state === "measured")
    verdict(input.verdict, reference.mode, "qualification vote verdict");
  const semantic = {
    release: RELEASE_ID,
    studyDigest: study.studyDigest,
    blindItemId: reference.blindItemId,
    referenceDigest: reference.referenceDigest,
    model: input.model,
    promptDigest: digest(input.promptDigest, "qualification vote promptDigest"),
    responseDigest:
      input.responseDigest === null
        ? null
        : digest(input.responseDigest, "qualification vote responseDigest"),
    resolvedModel: input.resolvedModel,
    usage: input.usage,
    ...(input.state === "measured"
      ? { state: input.state, verdict: input.verdict }
      : {
          state: input.state,
          cause: string(input.cause, "qualification vote cause"),
        }),
  } as const;
  return { ...semantic, voteDigest: stableDigest(semantic) };
}

function parseQualificationVoteRecord(value: unknown): QualificationVoteRecord {
  const parsed = record(value, "qualification vote");
  const state = literal(
    parsed.state,
    ["measured", "abstained", "invalid", "unavailable", "failed"] as const,
    "qualification vote state",
  );
  exact(
    parsed,
    [
      "release",
      "studyDigest",
      "blindItemId",
      "referenceDigest",
      "model",
      "promptDigest",
      "responseDigest",
      "resolvedModel",
      "usage",
      "state",
      state === "measured" ? "verdict" : "cause",
      "voteDigest",
    ],
    "qualification vote",
  );
  literal(parsed.release, [RELEASE_ID], "qualification vote release");
  digest(parsed.studyDigest, "qualification vote studyDigest");
  string(parsed.blindItemId, "qualification vote blindItemId");
  digest(parsed.referenceDigest, "qualification vote referenceDigest");
  literal(parsed.model, APPROVED_JUDGE_MODELS, "qualification vote model");
  digest(parsed.promptDigest, "qualification vote promptDigest");
  if (parsed.responseDigest !== null)
    digest(parsed.responseDigest, "qualification vote responseDigest");
  if (parsed.resolvedModel !== null)
    string(parsed.resolvedModel, "qualification vote resolvedModel");
  if (
    state === "measured" &&
    (parsed.responseDigest === null || parsed.resolvedModel === null)
  )
    throw new TypeError(
      "measured qualification vote requires a response digest and resolved model",
    );
  if (state !== "measured") string(parsed.cause, "qualification vote cause");
  const { voteDigest, ...semantic } = parsed;
  if (
    digest(voteDigest, "qualification vote digest") !== stableDigest(semantic)
  )
    throw new TypeError("qualification vote digest is invalid");
  return parsed as unknown as QualificationVoteRecord;
}

type Accuracy =
  | {
      readonly state: "measured";
      readonly correct: number;
      readonly total: number;
      readonly value: number;
    }
  | {
      readonly state: "unmeasured";
      readonly correct: 0;
      readonly total: 0;
      readonly value: null;
    };

function accuracy(correct: number, total: number): Accuracy {
  return total === 0
    ? { state: "unmeasured", correct: 0, total: 0, value: null }
    : { state: "measured", correct, total, value: correct / total };
}

export interface JudgeQualificationEvidence {
  readonly release: typeof RELEASE_ID;
  readonly protocol: typeof JUDGE_PROTOCOL;
  readonly studyDigest: Digest;
  readonly humanCriterionDigest: Digest;
  readonly state: "qualified" | "not_qualified" | "unavailable";
  readonly models: readonly {
    readonly release: typeof RELEASE_ID;
    readonly protocol: typeof JUDGE_PROTOCOL;
    readonly studyDigest: Digest;
    readonly humanCriterionDigest: Digest;
    readonly model: ApprovedJudgeModel;
    readonly state: "qualified" | "not_qualified" | "unavailable";
    readonly overall: Accuracy;
    readonly cells: readonly {
      readonly form: BenchmarkForm;
      readonly dimension: JudgeDimension;
      readonly accuracy: Accuracy;
    }[];
    readonly zeroErrorFailures: readonly string[];
    readonly orientationFailures: readonly string[];
    readonly evidenceDigest: Digest;
  }[];
  readonly evidenceDigest: Digest;
}

export function deriveJudgeQualifications(
  study: QualificationStudy,
  bank: ValidatedBank,
  records: readonly HumanAnnotationRecord[],
  votes: readonly QualificationVoteRecord[],
): JudgeQualificationEvidence {
  const criterion = deriveHumanCriterion(study, bank, records);
  const measured = criterion.references.filter(
    (reference): reference is Extract<HumanReference, { state: "measured" }> =>
      reference.state === "measured",
  );
  const references = new Map(measured.map((item) => [item.blindItemId, item]));
  const seen = new Set<string>();
  const boundVotes = votes.map(parseQualificationVoteRecord);
  for (const vote of boundVotes) {
    const reference = references.get(vote.blindItemId);
    if (
      vote.studyDigest !== study.studyDigest ||
      !reference ||
      vote.referenceDigest !== reference.referenceDigest ||
      vote.promptDigest !== reference.judgePromptDigest ||
      !APPROVED_JUDGE_MODELS.includes(vote.model)
    )
      throw new TypeError(
        "qualification vote does not bind measured human evidence",
      );
    if (vote.state === "measured")
      verdict(vote.verdict, reference.mode, "qualification vote verdict");
    const key = `${vote.model}\u0000${vote.blindItemId}`;
    if (seen.has(key)) throw new TypeError("duplicate qualification vote");
    seen.add(key);
  }
  const modelEvidence = APPROVED_JUDGE_MODELS.map((model) => {
    const modelVotes = new Map(
      boundVotes
        .filter((vote) => vote.model === model)
        .map((vote) => [vote.blindItemId, vote]),
    );
    const unavailable =
      criterion.state !== "ready" ||
      measured.some((reference) => {
        const vote = modelVotes.get(reference.blindItemId);
        return (
          !vote || vote.state !== "measured" || vote.resolvedModel !== model
        );
      });
    const comparable = measured.flatMap((reference) => {
      const vote = modelVotes.get(reference.blindItemId);
      return vote?.state === "measured" && vote.resolvedModel === model
        ? [{ reference, vote, correct: vote.verdict === reference.verdict }]
        : [];
    });
    const overall = accuracy(
      comparable.filter(({ correct }) => correct).length,
      comparable.length,
    );
    const cells = criterion.cells.map(({ form, dimension }) => {
      const values = comparable.filter(
        ({ reference }) =>
          reference.form === form && reference.dimension === dimension,
      );
      return {
        form,
        dimension,
        accuracy: accuracy(
          values.filter(({ correct }) => correct).length,
          values.length,
        ),
      };
    });
    const zeroErrorFailures = comparable
      .filter(
        ({ reference, correct }) =>
          !correct &&
          (study.thresholds.zeroErrorDimensions.includes(reference.dimension) ||
            reference.strata.some((stratum) =>
              study.thresholds.zeroErrorStrata.includes(stratum),
            )),
      )
      .map(({ reference }) => reference.blindItemId)
      .sort();
    const orientationFailures = [
      ...Map.groupBy(
        comparable.filter(({ reference }) => reference.pairId !== null),
        ({ reference }) => reference.pairId!,
      ),
    ]
      .filter(([, pair]) => {
        if (pair.length !== 2) return true;
        const selected = pair.map(({ reference, vote }) =>
          vote.verdict === "tie"
            ? null
            : reference.artifactIds[vote.verdict === "left" ? 0 : 1],
        );
        return selected[0] !== selected[1];
      })
      .map(([pairId]) => pairId)
      .sort();
    const passes =
      !unavailable &&
      overall.state === "measured" &&
      overall.value >= study.thresholds.minimumOverallAccuracy &&
      cells.every(
        ({ accuracy: cellAccuracy }) =>
          cellAccuracy.state === "measured" &&
          cellAccuracy.value >= study.thresholds.minimumCellAccuracy,
      ) &&
      zeroErrorFailures.length === 0 &&
      (!study.thresholds.requireOrientationConsistency ||
        orientationFailures.length === 0);
    const state = unavailable
      ? "unavailable"
      : passes
        ? "qualified"
        : "not_qualified";
    const semantic = {
      release: RELEASE_ID,
      protocol: study.protocol,
      studyDigest: study.studyDigest,
      humanCriterionDigest: criterion.criterionDigest,
      model,
      state,
      overall,
      cells,
      zeroErrorFailures,
      orientationFailures,
    } as const;
    return { ...semantic, evidenceDigest: stableDigest(semantic) };
  });
  const state = modelEvidence.some(({ state }) => state === "unavailable")
    ? "unavailable"
    : modelEvidence.every(({ state }) => state === "qualified")
      ? "qualified"
      : "not_qualified";
  const semantic = {
    release: RELEASE_ID,
    protocol: study.protocol,
    studyDigest: study.studyDigest,
    humanCriterionDigest: criterion.criterionDigest,
    state,
    models: modelEvidence,
  } as const;
  return { ...semantic, evidenceDigest: stableDigest(semantic) };
}

export function createQualifiedJudgeConfiguration(
  evidence: JudgeQualificationEvidence,
): JudgeConfiguration {
  const { evidenceDigest, ...semantic } = evidence;
  if (
    evidence.state !== "qualified" ||
    evidence.protocol !== JUDGE_PROTOCOL ||
    evidenceDigest !== stableDigest(semantic)
  )
    throw new TypeError("qualified judge evidence report is required");
  const byModel = new Map(evidence.models.map((model) => [model.model, model]));
  for (const model of APPROVED_JUDGE_MODELS) {
    const item = byModel.get(model);
    if (!item || item.state !== "qualified")
      throw new TypeError("all configured judges must be qualified");
    const { evidenceDigest: modelDigest, ...modelSemantic } = item;
    if (
      item.protocol !== JUDGE_PROTOCOL ||
      item.studyDigest !== evidence.studyDigest ||
      item.humanCriterionDigest !== evidence.humanCriterionDigest ||
      modelDigest !== stableDigest(modelSemantic)
    )
      throw new TypeError("judge model evidence binding is invalid");
  }
  if (byModel.size !== APPROVED_JUDGE_MODELS.length)
    throw new TypeError("judge evidence contains an unexpected model");
  const qualifications = Object.fromEntries(
    APPROVED_JUDGE_MODELS.map((model) => {
      const semantic = {
        release: RELEASE_ID,
        protocol: JUDGE_PROTOCOL,
        studyDigest: evidence.studyDigest,
        model,
        state: "qualified" as const,
        qualificationEvidenceDigest: byModel.get(model)!.evidenceDigest,
      };
      return [model, { ...semantic, evidenceDigest: stableDigest(semantic) }];
    }),
  );
  return bindQualifiedJudgeConfiguration({
    protocol: JUDGE_PROTOCOL,
    studyDigest: evidence.studyDigest,
    primaryJudges: PRIMARY_JUDGE_MODELS,
    crossValidationJudges: CROSS_VALIDATION_JUDGE_MODELS,
    qualifications,
  });
}

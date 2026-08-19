import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  BENCHMARK_CONDITIONS,
  RELEASE_ID,
  stableDigest,
  type BenchmarkCondition,
  type Digest,
} from "./contracts.ts";
import {
  renderCase,
  validateCandidateSubmission,
  type CandidateSubmission,
  type CandidateSubmissionValidation,
} from "./artifact.ts";
import { validateBank } from "./bank.ts";

export type QualificationConstructionIntent = string;
export type FamilyVariantKind = "base" | "stress";

interface QualificationManifestSemantic {
  readonly release: typeof RELEASE_ID;
  readonly corpusId: "provisional_judge_qualification_corpus";
  readonly status: "output_corpus_frozen";
  readonly authority: "synthetic_construction";
  readonly publicBankDigest: Digest;
  readonly evaluatorProtocolDigest: Digest;
  readonly constructionPlanPath: "construction-plan.json";
  readonly constructionPlanDigest: Digest;
  readonly submissionsPath: "submissions.jsonl";
  readonly submissionsDigest: Digest;
  readonly census: {
    readonly familyVariants: 48;
    readonly submissions: 144;
    readonly conditions: Readonly<Record<BenchmarkCondition, 48>>;
  };
  readonly stressCaseIds: readonly string[];
}

export type QualificationManifest = QualificationManifestSemantic & {
  readonly corpusDigest: Digest;
};

export interface QualificationFamilyVariant {
  readonly familyVariantId: string;
  readonly sourceCaseId: string;
  readonly variant: FamilyVariantKind;
  readonly constructionIntent: Readonly<
    Record<BenchmarkCondition, QualificationConstructionIntent>
  >;
}

export interface QualificationSubmissionRecord {
  readonly exampleId: string;
  readonly familyVariantId: string;
  readonly sourceCaseId: string;
  readonly sourceCaseDigest: Digest;
  readonly condition: BenchmarkCondition;
  readonly candidateSubmission: CandidateSubmission;
  readonly sourceBankDigest: Digest;
  readonly evaluatorProtocolDigest: Digest;
  readonly submissionDigest: Digest;
}

export interface ValidatedQualificationSubmission extends QualificationSubmissionRecord {
  readonly validation: CandidateSubmissionValidation;
}

export interface ValidatedQualificationCorpus {
  readonly manifest: QualificationManifest;
  readonly familyVariants: readonly (QualificationFamilyVariant & {
    readonly submissions: readonly ValidatedQualificationSubmission[];
  })[];
  readonly submissions: readonly ValidatedQualificationSubmission[];
  readonly referenceLabelsPresent: boolean;
  readonly constructionIntentCounts: Readonly<Record<string, number>>;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  return value as JsonRecord;
}

function exact(value: JsonRecord, keys: readonly string[], label: string) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new TypeError(`${label} must contain exactly ${expected.join(", ")}`);
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "")
    throw new TypeError(`${label} must be a non-empty string`);
  return value;
}

function digest(value: unknown, label: string): Digest {
  if (typeof value !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value))
    throw new TypeError(`${label} must be a sha256 digest`);
  return value as Digest;
}

function oneOf<const T extends readonly string[]>(
  value: unknown,
  choices: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !choices.includes(value))
    throw new TypeError(`${label} must be one of ${choices.join(", ")}`);
  return value as T[number];
}

function parseConstructionIntent(
  value: unknown,
): Record<BenchmarkCondition, QualificationConstructionIntent> {
  const parsed = record(value, "family variant constructionIntent");
  exact(parsed, BENCHMARK_CONDITIONS, "family variant constructionIntent");
  return Object.fromEntries(
    BENCHMARK_CONDITIONS.map((condition) => [
      condition,
      nonempty(
        parsed[condition],
        `family variant constructionIntent.${condition}`,
      ),
    ]),
  ) as Record<BenchmarkCondition, QualificationConstructionIntent>;
}

function parseFamilyVariant(
  value: unknown,
  index: number,
): QualificationFamilyVariant {
  const label = `constructionPlan.familyVariants[${index}]`;
  const parsed = record(value, label);
  exact(
    parsed,
    ["familyVariantId", "sourceCaseId", "variant", "constructionIntent"],
    label,
  );
  return {
    familyVariantId: nonempty(
      parsed.familyVariantId,
      `${label}.familyVariantId`,
    ),
    sourceCaseId: nonempty(parsed.sourceCaseId, `${label}.sourceCaseId`),
    variant: oneOf(
      parsed.variant,
      ["base", "stress"] as const,
      `${label}.variant`,
    ),
    constructionIntent: parseConstructionIntent(parsed.constructionIntent),
  };
}

function parseSubmission(
  value: unknown,
  index: number,
): QualificationSubmissionRecord {
  const label = `submissions[${index}]`;
  const parsed = record(value, label);
  exact(
    parsed,
    [
      "exampleId",
      "familyVariantId",
      "sourceCaseId",
      "sourceCaseDigest",
      "condition",
      "candidateSubmission",
      "sourceBankDigest",
      "evaluatorProtocolDigest",
      "submissionDigest",
    ],
    label,
  );
  const semantic = {
    exampleId: nonempty(parsed.exampleId, `${label}.exampleId`),
    familyVariantId: nonempty(
      parsed.familyVariantId,
      `${label}.familyVariantId`,
    ),
    sourceCaseId: nonempty(parsed.sourceCaseId, `${label}.sourceCaseId`),
    sourceCaseDigest: digest(
      parsed.sourceCaseDigest,
      `${label}.sourceCaseDigest`,
    ),
    condition: oneOf(
      parsed.condition,
      BENCHMARK_CONDITIONS,
      `${label}.condition`,
    ),
    candidateSubmission: parsed.candidateSubmission as CandidateSubmission,
    sourceBankDigest: digest(
      parsed.sourceBankDigest,
      `${label}.sourceBankDigest`,
    ),
    evaluatorProtocolDigest: digest(
      parsed.evaluatorProtocolDigest,
      `${label}.evaluatorProtocolDigest`,
    ),
  };
  const submissionDigest = digest(
    parsed.submissionDigest,
    `${label}.submissionDigest`,
  );
  if (submissionDigest !== stableDigest(semantic))
    throw new TypeError(`${label}.submissionDigest does not match its content`);
  return { ...semantic, submissionDigest };
}

function parseManifest(value: unknown): QualificationManifest {
  const parsed = record(value, "qualification manifest");
  exact(
    parsed,
    [
      "release",
      "corpusId",
      "status",
      "authority",
      "publicBankDigest",
      "evaluatorProtocolDigest",
      "constructionPlanPath",
      "constructionPlanDigest",
      "submissionsPath",
      "submissionsDigest",
      "census",
      "stressCaseIds",
      "corpusDigest",
    ],
    "qualification manifest",
  );
  const census = record(parsed.census, "qualification manifest.census");
  exact(
    census,
    ["familyVariants", "submissions", "conditions"],
    "qualification manifest.census",
  );
  const conditions = record(
    census.conditions,
    "qualification manifest.census.conditions",
  );
  exact(
    conditions,
    BENCHMARK_CONDITIONS,
    "qualification manifest.census.conditions",
  );
  const stressCaseIds = Array.isArray(parsed.stressCaseIds)
    ? parsed.stressCaseIds.map((entry, index) =>
        nonempty(entry, `qualification manifest.stressCaseIds[${index}]`),
      )
    : (() => {
        throw new TypeError(
          "qualification manifest.stressCaseIds must be an array",
        );
      })();
  const semantic: QualificationManifestSemantic = {
    release: oneOf(
      parsed.release,
      [RELEASE_ID] as const,
      "qualification manifest.release",
    ),
    corpusId: oneOf(
      parsed.corpusId,
      ["provisional_judge_qualification_corpus"] as const,
      "qualification manifest.corpusId",
    ),
    status: oneOf(
      parsed.status,
      ["output_corpus_frozen"] as const,
      "qualification manifest.status",
    ),
    authority: oneOf(
      parsed.authority,
      ["synthetic_construction"] as const,
      "qualification manifest.authority",
    ),
    publicBankDigest: digest(
      parsed.publicBankDigest,
      "qualification manifest.publicBankDigest",
    ),
    evaluatorProtocolDigest: digest(
      parsed.evaluatorProtocolDigest,
      "qualification manifest.evaluatorProtocolDigest",
    ),
    constructionPlanPath: oneOf(
      parsed.constructionPlanPath,
      ["construction-plan.json"] as const,
      "qualification manifest.constructionPlanPath",
    ),
    constructionPlanDigest: digest(
      parsed.constructionPlanDigest,
      "qualification manifest.constructionPlanDigest",
    ),
    submissionsPath: oneOf(
      parsed.submissionsPath,
      ["submissions.jsonl"] as const,
      "qualification manifest.submissionsPath",
    ),
    submissionsDigest: digest(
      parsed.submissionsDigest,
      "qualification manifest.submissionsDigest",
    ),
    census: {
      familyVariants:
        census.familyVariants === 48
          ? 48
          : (() => {
              throw new TypeError(
                "qualification manifest.census.familyVariants must be 48",
              );
            })(),
      submissions:
        census.submissions === 144
          ? 144
          : (() => {
              throw new TypeError(
                "qualification manifest.census.submissions must be 144",
              );
            })(),
      conditions: Object.fromEntries(
        BENCHMARK_CONDITIONS.map((condition) => {
          if (conditions[condition] !== 48)
            throw new TypeError(
              `qualification manifest.census.conditions.${condition} must be 48`,
            );
          return [condition, 48];
        }),
      ) as Record<BenchmarkCondition, 48>,
    },
    stressCaseIds,
  };
  const corpusDigest = digest(
    parsed.corpusDigest,
    "qualification manifest.corpusDigest",
  );
  if (corpusDigest !== stableDigest(semantic))
    throw new TypeError(
      "qualification manifest.corpusDigest does not match its content",
    );
  return { ...semantic, corpusDigest };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function validateQualificationCorpus(
  corpusRoot: string,
  bankRoot: string,
): Promise<ValidatedQualificationCorpus> {
  const bank = await validateBank(bankRoot);
  const manifest = parseManifest(
    JSON.parse(await readFile(join(corpusRoot, "manifest.json"), "utf8")),
  );
  if (manifest.publicBankDigest !== bank.manifest.bankDigest)
    throw new TypeError(
      "qualification corpus publicBankDigest does not match the canonical bank",
    );
  if (manifest.evaluatorProtocolDigest !== bank.manifest.protocolDigest)
    throw new TypeError(
      "qualification corpus evaluatorProtocolDigest does not match the bank protocol",
    );

  const constructionValue = JSON.parse(
    await readFile(join(corpusRoot, manifest.constructionPlanPath), "utf8"),
  );
  if (manifest.constructionPlanDigest !== stableDigest(constructionValue))
    throw new TypeError(
      "qualification construction plan digest does not match",
    );
  const construction = record(constructionValue, "construction plan");
  exact(
    construction,
    ["release", "corpusId", "constructionIntentCounts", "familyVariants"],
    "construction plan",
  );
  const rawVariants = Array.isArray(construction.familyVariants)
    ? construction.familyVariants
    : (() => {
        throw new TypeError("constructionPlan.familyVariants must be an array");
      })();
  const variants = rawVariants.map(parseFamilyVariant);
  oneOf(
    construction.release,
    [RELEASE_ID] as const,
    "construction plan.release",
  );
  oneOf(
    construction.corpusId,
    ["provisional_judge_qualification_corpus"] as const,
    "construction plan.corpusId",
  );
  const declaredIntentCounts = record(
    construction.constructionIntentCounts,
    "construction plan.constructionIntentCounts",
  );
  const actualIntentCounts: Record<string, number> = {};
  for (const variant of variants)
    for (const intent of Object.values(variant.constructionIntent))
      actualIntentCounts[intent] = (actualIntentCounts[intent] ?? 0) + 1;
  if (
    JSON.stringify(Object.keys(declaredIntentCounts).sort()) !==
    JSON.stringify(Object.keys(actualIntentCounts).sort())
  )
    throw new TypeError(
      "construction plan constructionIntentCounts keys do not match",
    );
  for (const intent of Object.keys(actualIntentCounts)) {
    if (declaredIntentCounts[intent] !== actualIntentCounts[intent])
      throw new TypeError(
        `construction plan construction intent count does not match for ${intent}`,
      );
  }

  const rawSubmissions = (
    await readFile(join(corpusRoot, manifest.submissionsPath), "utf8")
  )
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, index) => parseSubmission(JSON.parse(line), index));
  if (manifest.submissionsDigest !== stableDigest(rawSubmissions))
    throw new TypeError("qualification submissions digest does not match");
  if (variants.length !== 48 || rawSubmissions.length !== 144)
    throw new TypeError(
      "qualification corpus must contain 48 variants and 144 submissions",
    );
  if (
    new Set(variants.map(({ familyVariantId }) => familyVariantId)).size !==
    variants.length
  )
    throw new TypeError("qualification familyVariantId values must be unique");
  if (
    new Set(rawSubmissions.map(({ exampleId }) => exampleId)).size !==
    rawSubmissions.length
  )
    throw new TypeError("qualification exampleId values must be unique");

  const bankCases = new Map(
    bank.cases.map((entry) => [entry.entry.caseId, entry]),
  );
  const validated = rawSubmissions.map((submission) => {
    const source = bankCases.get(submission.sourceCaseId);
    if (source === undefined)
      throw new TypeError(
        `unknown qualification source case ${submission.sourceCaseId}`,
      );
    if (submission.sourceCaseDigest !== source.manifest.manifestDigest)
      throw new TypeError(
        `${submission.exampleId} sourceCaseDigest does not match`,
      );
    if (submission.sourceBankDigest !== bank.manifest.bankDigest)
      throw new TypeError(
        `${submission.exampleId} sourceBankDigest does not match`,
      );
    if (submission.evaluatorProtocolDigest !== bank.manifest.protocolDigest)
      throw new TypeError(
        `${submission.exampleId} evaluatorProtocolDigest does not match`,
      );
    const task = renderCase(source.manifest, {
      condition: submission.condition,
    });
    return {
      ...submission,
      validation: validateCandidateSubmission(
        task,
        submission.candidateSubmission,
      ),
    };
  });
  if (validated.some(({ validation }) => validation.state !== "valid"))
    throw new TypeError(
      "every qualification submission must satisfy the candidate contract",
    );

  const familyVariants = variants.map((variant) => {
    const submissions = validated.filter(
      ({ familyVariantId }) => familyVariantId === variant.familyVariantId,
    );
    if (submissions.length !== 3)
      throw new TypeError(
        `${variant.familyVariantId} must contain exactly three submissions`,
      );
    if (
      submissions.some(
        ({ sourceCaseId }) => sourceCaseId !== variant.sourceCaseId,
      )
    )
      throw new TypeError(
        `${variant.familyVariantId} source case binding does not match`,
      );
    if (
      BENCHMARK_CONDITIONS.some(
        (condition) =>
          !submissions.some((submission) => submission.condition === condition),
      )
    )
      throw new TypeError(
        `${variant.familyVariantId} must contain all three conditions`,
      );
    return { ...variant, submissions };
  });
  if (
    validated.some(
      ({ familyVariantId }) =>
        !variants.some(
          (variant) => variant.familyVariantId === familyVariantId,
        ),
    )
  )
    throw new TypeError(
      "qualification submission references an unknown family variant",
    );

  const baseCases = variants
    .filter(({ variant }) => variant === "base")
    .map(({ sourceCaseId }) => sourceCaseId);
  const stressCases = variants
    .filter(({ variant }) => variant === "stress")
    .map(({ sourceCaseId }) => sourceCaseId);
  if (baseCases.length !== 32 || new Set(baseCases).size !== 32)
    throw new TypeError(
      "qualification corpus must contain one base variant for every public case",
    );
  if (
    JSON.stringify([...stressCases].sort()) !==
    JSON.stringify([...manifest.stressCaseIds].sort())
  )
    throw new TypeError(
      "qualification stress variants do not match the manifest",
    );
  if (new Set(stressCases).size !== 16)
    throw new TypeError(
      "qualification corpus must contain sixteen distinct stress source cases",
    );

  return {
    manifest,
    familyVariants,
    submissions: validated,
    referenceLabelsPresent: await exists(
      join(corpusRoot, "reference-labels.jsonl"),
    ),
    constructionIntentCounts: actualIntentCounts,
  };
}

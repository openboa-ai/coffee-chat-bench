import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { stableDigest } from "../src/contracts.ts";
import { validateQualificationCorpus } from "../src/qualification.ts";

const corpusRoot = process.argv[2] ?? "qualification/corpus";
const corpus = await validateQualificationCorpus(
  corpusRoot,
  process.argv[3] ?? "bank",
);
const labels = corpus.referenceLabelsPresent
  ? JSON.parse(
      await readFile(join(corpusRoot, "label-distribution.json"), "utf8"),
    )
  : null;
const labelManifest = corpus.referenceLabelsPresent
  ? JSON.parse(
      await readFile(
        join(corpusRoot, "reference-labels-manifest.json"),
        "utf8",
      ),
    )
  : null;
const referenceLabels = corpus.referenceLabelsPresent
  ? (await readFile(join(corpusRoot, "reference-labels.jsonl"), "utf8"))
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line))
  : [];
if (referenceLabels.length !== 144)
  throw new Error(
    "qualification reference labels must contain exactly 144 rows",
  );
if (new Set(referenceLabels.map(({ exampleId }) => exampleId)).size !== 144)
  throw new Error("qualification reference label example IDs must be unique");
const submissionByExample = new Map(
  corpus.submissions.map((submission) => [submission.exampleId, submission]),
);
for (const label of referenceLabels) {
  const submission = submissionByExample.get(label.exampleId);
  if (!submission)
    throw new Error(`unknown reference label example ${label.exampleId}`);
  if (label.submissionDigest !== submission.submissionDigest)
    throw new Error(
      `${label.exampleId} label digest does not match submission`,
    );
  if (label.condition !== submission.condition)
    throw new Error(
      `${label.exampleId} label condition does not match submission`,
    );
  if (
    label.kind !== "pointwise_reference" ||
    label.authority !== "model_authored_draft"
  )
    throw new Error(
      `${label.exampleId} has an unsupported label authority or kind`,
    );
  const targetRelative = submission.condition !== "unconditioned";
  if ((label.judgmentAlignment.state === "measured") !== targetRelative)
    throw new Error(`${label.exampleId} has invalid judgment applicability`);
  if ((label.statedRationaleAlignment.state === "measured") !== targetRelative)
    throw new Error(`${label.exampleId} has invalid rationale applicability`);
  for (const reference of [
    label.judgmentAlignment,
    label.taskPerformance,
    label.evidenceGrounding,
  ])
    if (
      reference.state === "measured" &&
      ![1, 2, 3, 4, 5].includes(reference.score)
    )
      throw new Error(`${label.exampleId} contains an invalid scalar score`);
  if (
    label.hardConstraintViolation.state !== "measured" ||
    typeof label.hardConstraintViolation.detected !== "boolean"
  )
    throw new Error(
      `${label.exampleId} has an invalid hard-constraint reference`,
    );
}
if (labelManifest.referenceLabelsDigest !== stableDigest(referenceLabels))
  throw new Error(
    "reference-labels-manifest digest does not match reference labels",
  );
if (labelManifest.census?.total !== 144 || labelManifest.census?.pairwise !== 0)
  throw new Error(
    "qualification reference label census is not pointwise-only 144",
  );
if (labels && labelManifest.distributionDigest !== stableDigest(labels))
  throw new Error("label distribution digest does not match distribution");

console.log(
  JSON.stringify(
    {
      status: "passed",
      corpusDigest: corpus.manifest.corpusDigest,
      publicBankDigest: corpus.manifest.publicBankDigest,
      census: corpus.manifest.census,
      stressCaseIds: corpus.manifest.stressCaseIds,
      constructionIntentCounts: corpus.constructionIntentCounts,
      referenceLabelsPresent: corpus.referenceLabelsPresent,
      referenceLabels: labelManifest
        ? {
            authority: labelManifest.authority,
            reviewState: labelManifest.reviewState,
            census: labelManifest.census,
            distribution: labels,
          }
        : null,
    },
    null,
    2,
  ),
);

#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const root = process.argv[2] ?? "qualification/corpus";
const labelsPath = `${root}/reference-labels.jsonl`;
const submissionsPath = `${root}/submissions.jsonl`;

const readJsonl = async (path) =>
  (await readFile(path, "utf8"))
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));

const labels = await readJsonl(labelsPath);
const submissions = await readJsonl(submissionsPath);
const submissionsById = new Map(
  submissions.map((submission) => [submission.exampleId, submission]),
);

const measuredFacets = [
  "cueUtilization",
  "cueWeighting",
  "contextSensitivity",
  "actionConsistency",
];

function shortText(value, limit = 180) {
  const text = String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function list(values, fallback) {
  const normalized = values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized.join(", ") : fallback;
}

function recordFor(label) {
  const submission = submissionsById.get(label.exampleId);
  if (!submission) throw new Error(`missing submission for ${label.exampleId}`);
  const record = submission.candidateSubmission?.decisionRecord;
  if (!record)
    throw new Error(`missing decision record for ${label.exampleId}`);
  const artifact = submission.candidateSubmission?.artifact?.content;
  if (typeof artifact !== "string" || artifact.trim() === "")
    throw new Error(`missing artifact content for ${label.exampleId}`);
  return { record, artifact };
}

function facetRationales(label) {
  const reference = label.statedRationaleAlignment;
  if (reference?.state !== "measured") return null;
  const { record, artifact } = recordFor(label);
  const sourceIds = list(
    (record.evidenceUse ?? []).map((item) => item.sourceId),
    "no source IDs",
  );
  const factors = list(
    (record.tradeoffs ?? []).flatMap((tradeoff) => tradeoff.factors ?? []),
    "no explicit trade-off factors",
  );
  const resolution =
    shortText(
      (record.tradeoffs ?? [])
        .map((tradeoff) => tradeoff.resolution)
        .filter(Boolean)
        .join("; "),
      220,
    ) || "no explicit trade-off resolution";
  const decision = shortText(record.decision, 220) || "no stated decision";
  const uncertainty =
    shortText(record.uncertainty, 180) || "no uncertainty stated";
  const artifactExcerpt = shortText(artifact, 220);

  return {
    cueUtilization: {
      ...reference.cueUtilization,
      rationale: `Cue utilization: the decision record cites ${sourceIds} and names ${factors}. The stated decision is “${decision}”. Score ${reference.cueUtilization.score} reflects whether the record identifies and uses decision-relevant cues from the visible case rather than merely mentioning them.`,
    },
    cueWeighting: {
      ...reference.cueWeighting,
      rationale: `Cue weighting: the record resolves the trade-off as “${resolution}”. Score ${reference.cueWeighting.score} reflects whether the relative priority among the visible cues is explicit and appropriately carried into the decision.`,
    },
    contextSensitivity: {
      ...reference.contextSensitivity,
      rationale: `Context sensitivity: the record states “${uncertainty}” and recommends “${decision}”. Score ${reference.contextSensitivity.score} reflects whether the judgment responds to the supplied boundary conditions instead of applying one policy without regard to context.`,
    },
    actionConsistency: {
      ...reference.actionConsistency,
      rationale: `Action consistency: the visible artifact begins “${artifactExcerpt}”. Score ${reference.actionConsistency.score} reflects whether that artifact operationalizes the decision record “${decision}” without an unexplained divergence between stated rationale and recommended action.`,
    },
  };
}

function comparable(label) {
  const copy = structuredClone(label);
  for (const facet of measuredFacets) {
    if (copy.statedRationaleAlignment?.[facet])
      copy.statedRationaleAlignment[facet].rationale = "<facet-rationale>";
  }
  return JSON.stringify(copy);
}

const before = new Map(
  labels.map((label) => [label.exampleId, comparable(label)]),
);
const rewritten = labels.map((label) => {
  const next = structuredClone(label);
  const facets = facetRationales(next);
  if (facets) {
    for (const facet of measuredFacets)
      next.statedRationaleAlignment[facet] = facets[facet];
  }
  return next;
});

if (rewritten.length !== labels.length || rewritten.length !== 144)
  throw new Error("rationale rewrite must preserve all 144 labels");
for (const label of rewritten) {
  if (before.get(label.exampleId) !== comparable(label))
    throw new Error(
      `rationale rewrite changed protected label fields for ${label.exampleId}`,
    );
  if (label.statedRationaleAlignment?.state === "measured") {
    const rationaleSet = new Set(
      measuredFacets.map(
        (facet) => label.statedRationaleAlignment[facet]?.rationale,
      ),
    );
    if (rationaleSet.size < measuredFacets.length)
      throw new Error(
        `facet rationales are not distinct for ${label.exampleId}`,
      );
    if (
      measuredFacets.some((facet) =>
        /construction\s+intent/iu.test(
          label.statedRationaleAlignment[facet].rationale,
        ),
      )
    )
      throw new Error(
        `construction-intent language remains for ${label.exampleId}`,
      );
  }
}

await writeFile(
  labelsPath,
  `${rewritten.map((label) => JSON.stringify(label)).join("\n")}\n`,
  "utf8",
);
process.stdout.write(
  `${JSON.stringify({ labelsPath, labels: rewritten.length, rewrittenFacetRows: rewritten.filter((label) => label.statedRationaleAlignment?.state === "measured").length })}\n`,
);

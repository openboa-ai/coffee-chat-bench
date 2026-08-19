#!/usr/bin/env node

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import prettier from "prettier";

import {
  RELEASE_ID,
  createBankManifest,
  createCaseManifest,
  stableDigest,
} from "../src/benchmark-contracts.ts";
import {
  buildAllInputContent,
  buildPairAnnotation,
} from "./public-input-content.mjs";

const root = resolve(process.argv[2] ?? "bank");

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const json = await prettier.format(JSON.stringify(value), { parser: "json" });
  await writeFile(path, json, "utf8");
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function writeCsv(path, headers, rows) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`,
    "utf8",
  );
}

const content = buildAllInputContent();
await Promise.all([
  rm(resolve(root, "cases"), { recursive: true, force: true }),
  rm(resolve(root, "public"), { recursive: true, force: true }),
  rm(resolve(root, "evaluator"), { recursive: true, force: true }),
  rm(resolve(root, "annotations"), { recursive: true, force: true }),
]);
await mkdir(resolve(root, "public/cases"), { recursive: true });
await mkdir(resolve(root, "annotations/pairs"), { recursive: true });
await mkdir(resolve(root, "annotations/cases"), { recursive: true });

const entries = [];
const samplingPairs = [];
for (let pairIndex = 0; pairIndex < content.pairs.length; pairIndex += 1) {
  const pair = content.pairs[pairIndex];
  const pairCases = [];
  await writeJson(
    resolve(root, "annotations/pairs", `${pair.pairId}.json`),
    buildPairAnnotation(pairIndex),
  );
  for (const { blueprint, histories } of content.cases.filter(
    ({ blueprint }) => blueprint.pairId === pair.pairId,
  )) {
    const manifest = createCaseManifest({
      release: RELEASE_ID,
      caseId: blueprint.caseId,
      pairId: blueprint.pairId,
      form: blueprint.form,
      domain: blueprint.domain,
      transferType: blueprint.transferType,
      taskArchetype: blueprint.taskArchetype,
      taskMode: blueprint.taskMode,
      task: {
        instruction: blueprint.task.instruction,
        environment:
          blueprint.form === "dialogue"
            ? { kind: "conversation" }
            : {
                kind: "workspace",
                fixtureDigest: stableDigest({
                  caseId: blueprint.caseId,
                  fixture: "multi-document-input",
                }),
                verifierDigest: stableDigest({
                  caseId: blueprint.caseId,
                  verifier: "reference-contract",
                }),
              },
        deliverables: blueprint.task.deliverables,
        hardConstraints: blueprint.task.hardConstraints,
        output: {
          mediaType: "text/plain",
          maxBytes: 6000,
          requiredReferenceIds: blueprint.task.requiredReferenceIds,
        },
      },
      documents: blueprint.documents,
      contexts: {
        unconditioned: [],
        target_a: histories.target_a,
        target_b: histories.target_b,
      },
      lineage: {
        sourceIds: blueprint.documents.map(({ source }) => source),
        scenarioId: blueprint.annotations.userScenario,
      },
    });
    await writeJson(
      resolve(root, "public/cases", `${blueprint.caseId}.json`),
      manifest,
    );
    await writeJson(
      resolve(root, "annotations/cases", `${blueprint.caseId}.json`),
      blueprint.annotations,
    );
    const entry = {
      caseId: blueprint.caseId,
      pairId: blueprint.pairId,
      form: blueprint.form,
      domain: blueprint.domain,
      transferType: blueprint.transferType,
      taskArchetype: blueprint.taskArchetype,
      taskMode: blueprint.taskMode,
      casePath: `public/cases/${blueprint.caseId}.json`,
      manifestDigest: manifest.manifestDigest,
    };
    entries.push(entry);
    pairCases.push({
      caseId: blueprint.caseId,
      domain: blueprint.domain,
      transferType: blueprint.transferType,
      form: blueprint.form,
      taskMode: blueprint.taskMode,
      taskArchetype: blueprint.taskArchetype,
      documentCount: blueprint.documents.length,
      workspaceNoise: blueprint.annotations.workspaceNoise,
    });
  }
  samplingPairs.push({ pairId: pair.pairId, cases: pairCases });
}

const census = {
  pairs: 8,
  targets: 16,
  historyRecordsPerTarget: 8,
  caseFamilies: 32,
  conditions: 3,
  agentExecutions: 96,
};
const samplingPlan = {
  release: RELEASE_ID,
  bankId: "public_judgment_history_bank",
  census,
  strata: {
    domains: 8,
    transferTypes: 4,
    forms: { dialogue: 16, professional_artifact: 16 },
    taskModes: { bounded: 16, open_ended: 16 },
    taskArchetypes: {
      recommendation: 8,
      allocation_prioritization: 8,
      design_threshold: 8,
      critique_revision: 8,
    },
    documentComplexity: { compact: 0, standard: 32, dense: 0 },
    workspaceNoise: { clean: 0, ordinary: 16, noisy: 16, dense_noisy: 0 },
  },
  pairs: samplingPairs,
};
await writeJson(resolve(root, "sampling-plan.json"), samplingPlan);

const bank = createBankManifest({
  release: RELEASE_ID,
  bankId: "public_judgment_history_bank",
  status: "not_active",
  license: "MIT",
  samplingPlanPath: "sampling-plan.json",
  samplingPlanDigest: stableDigest(samplingPlan),
  protocolDigest: stableDigest({
    protocol: "public-judgment-history-bank",
    conditions: ["unconditioned", "target_a", "target_b"],
    candidateType: "agent",
    input: "multi-document-case-with-optional-history",
  }),
  cases: entries,
});
await writeJson(resolve(root, "bank.json"), bank);

const repositoryRoot = resolve(root, "..");
const rightsRows = [
  "bank/bank.json",
  "bank/sampling-plan.json",
  ...entries.map(({ casePath }) => `bank/${casePath}`),
  ...samplingPairs.map(({ pairId }) => `bank/annotations/pairs/${pairId}.json`),
  ...entries.map(({ caseId }) => `bank/annotations/cases/${caseId}.json`),
].map((path) => ({
  kind: "file",
  path,
  contentClass: path.includes("/public/")
    ? "candidate_visible"
    : path.includes("/annotations/")
      ? "construction_annotation"
      : "governance",
  authorship: "openboa_ai_project_authored_synthetic",
  license: "MIT",
  humanReview: "pending",
  externalDependency: "none",
}));
await writeFile(
  resolve(repositoryRoot, "RIGHTS-PROVENANCE.jsonl"),
  `${rightsRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  "utf8",
);

const contaminationRows = [
  {
    bankId: "public_judgment_history_bank",
    scope: "entire_bank",
    bankDigest: bank.bankDigest,
    exposure: "public_prospective",
    trainingInclusion: "unknown",
    semanticReview: "pending",
    secrecyClaim: "none",
    interpretation:
      "The bank is public; no contamination-free or provider-training claim is made.",
  },
  ...entries.map(({ caseId }) => ({
    bankId: "public_judgment_history_bank",
    caseId,
    exposure: "public_prospective",
    trainingInclusion: "unknown",
    semanticReview: "pending",
    secrecyClaim: "none",
    interpretation:
      "Synthetic case; declared-corpus overlap and independent semantic review remain future evidence.",
  })),
];
await writeFile(
  resolve(repositoryRoot, "CONTAMINATION.jsonl"),
  `${contaminationRows.map((row) => JSON.stringify(row)).join("\n")}\n`,
  "utf8",
);

const documentContents = content.cases.flatMap(({ blueprint }) =>
  blueprint.documents.map(({ content: documentContent }) => documentContent),
);
await writeJson(resolve(repositoryRoot, "OVERLAP-REPORT.json"), {
  reportId: `public-bank-overlap-audit-${RELEASE_ID}`,
  bankId: "public_judgment_history_bank",
  bankDigest: bank.bankDigest,
  caseCount: entries.length,
  scope: "mechanical lineage and duplicate audit",
  state: "project_construction_reviewed",
  checks: {
    caseIndexComplete: true,
    documentBundleIndexComplete: true,
    sourceLineageUnique: true,
    crossCaseExactDuplicates:
      new Set(documentContents).size !== documentContents.length,
    semanticOverlap: "project_review_completed_not_independent",
    answerLeakage: "project_review_completed_not_independent",
  },
  claimBoundary:
    "Counts and exact-duplicate checks do not establish human agreement, AI-judge qualification, construct validity, or activation.",
});

const pairById = new Map(content.pairs.map((pair) => [pair.pairId, pair]));
await writeCsv(
  resolve(repositoryRoot, "docs/validity/public-bank-cases-review.csv"),
  [
    "case_id",
    "pair_id",
    "contrast_family",
    "domain",
    "transfer_type",
    "form",
    "task_archetype",
    "task_mode",
    "instruction",
    "document_titles",
    "hard_constraint",
    "review_status",
  ],
  content.cases.map(({ blueprint }) => [
    blueprint.caseId,
    blueprint.pairId,
    pairById.get(blueprint.pairId)?.contrastFamily ?? "",
    blueprint.domain,
    blueprint.transferType,
    blueprint.form,
    blueprint.taskArchetype,
    blueprint.taskMode,
    blueprint.task.instruction,
    blueprint.documents.map(({ title }) => title).join(" | "),
    blueprint.task.hardConstraints[2],
    "pending_human_audit",
  ]),
);
await writeCsv(
  resolve(repositoryRoot, "docs/validity/public-bank-histories-review.csv"),
  [
    "pair_id",
    "contrast_family",
    "target",
    "record_id",
    "format",
    "content",
    "review_status",
  ],
  content.pairs.flatMap((pair, pairIndex) =>
    ["target_a", "target_b"].flatMap((target) =>
      content.pairHistories[pairIndex][target].map((record) => [
        pair.pairId,
        pair.contrastFamily,
        target,
        record.id,
        record.format,
        record.content,
        "pending_human_audit",
      ]),
    ),
  ),
);

console.log(
  JSON.stringify(
    {
      bankDigest: bank.bankDigest,
      cases: entries.length,
      pairs: samplingPairs.length,
      documents: content.cases.reduce(
        (total, { blueprint }) => total + blueprint.documents.length,
        0,
      ),
    },
    null,
    2,
  ),
);

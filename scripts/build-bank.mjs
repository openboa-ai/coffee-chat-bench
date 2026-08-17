#!/usr/bin/env node

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  RELEASE_ID,
  createBankManifest,
  createCaseManifest,
  parseEvaluatorMaterial,
  stableDigest,
} from "../src/benchmark-contracts.ts";
import { pairs } from "./bank-content.mjs";

const root = resolve(process.argv[2] ?? "bank");

function sentence(value) {
  return `${value.trim().replace(/[.!?]+$/u, "")}.`;
}

function historyRecord(record, index, target) {
  const id = `record-${String(index + 1).padStart(2, "0")}`;
  const evidence = record.evidence.map((fact, evidenceIndex) => ({
    id: `history-${String(index + 1).padStart(2, "0")}-e${evidenceIndex + 1}`,
    fact: sentence(fact),
  }));
  const evidenceList = evidence
    .map(({ id: evidenceId, fact }) => `[${evidenceId}] ${fact}`)
    .join("\n");
  const evidenceInline = evidence
    .map(({ id: evidenceId, fact }) => `[${evidenceId}] ${fact}`)
    .join(" ");
  const selected = record[target];
  const decision = sentence(selected.decision);
  const renderers = {
    decision_note: `Situation: ${sentence(record.situation)}\nEvidence:\n${evidenceList}\nDecision: ${decision}`,
    message_excerpt: `Situation: ${sentence(record.situation)}\nMessage: We considered ${evidenceInline} The decision is ${decision}`,
    retrospective: `Situation: ${sentence(record.situation)}\nRecord: ${evidenceInline}\nRecorded decision: ${decision}`,
    structured_log: `situation=${sentence(record.situation)} evidence=${evidenceInline} decision=${decision}`,
  };
  const base = renderers[record.format];
  if (!base)
    throw new TypeError(`unsupported history format: ${record.format}`);
  return {
    id,
    format: record.format,
    content: selected.rationale
      ? `${base}\nReasoning: ${sentence(selected.rationale)}`
      : base,
  };
}

function pairHistories(pair) {
  return {
    target_a: pair.history.map((record, index) =>
      historyRecord(record, index, "a"),
    ),
    target_b: pair.history.map((record, index) =>
      historyRecord(record, index, "b"),
    ),
  };
}

function criterion(task) {
  return {
    authority: "project_author_hypothesis",
    humanReviewed: false,
    expectedDecisionFeatures: {
      target_a: task.targetA,
      target_b: task.targetB,
    },
    expectedReasoningFeatures: task.reasoning,
    allowedAlternatives: task.alternatives,
    taskPerformanceConditions: task.performance,
    evidenceGroundingConditions: task.grounding,
    criticalFailures: task.failures,
  };
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

await rm(resolve(root, "cases"), { recursive: true, force: true });
await rm(resolve(root, "public"), { recursive: true, force: true });
await rm(resolve(root, "evaluator"), { recursive: true, force: true });

const samplingPairs = [];
const entries = [];

for (const pair of pairs) {
  const histories = pairHistories(pair);
  const pairCases = [];

  for (const [taskIndex, task] of pair.tasks.entries()) {
    const caseId = `${pair.pairId}-${task.transferType}`;
    const evidence = task.evidence.map((content, evidenceIndex) => ({
      id: `evidence-${String(taskIndex + 1).padStart(2, "0")}-${String(evidenceIndex + 1).padStart(2, "0")}`,
      content,
      source: `synthetic://openboa-ai/coffee-chat-bench/evidence/${stableDigest({ caseId, evidenceIndex }).slice(7, 23)}`,
      license: "MIT",
    }));
    const manifest = createCaseManifest({
      release: RELEASE_ID,
      caseId,
      pairId: pair.pairId,
      form: task.form,
      domain: task.domain,
      transferType: task.transferType,
      taskArchetype: task.taskArchetype,
      taskMode: task.taskMode,
      task: {
        instruction: `${task.title}\n\n${task.instruction}`,
        environment:
          task.form === "dialogue"
            ? { kind: "conversation" }
            : {
                kind: "workspace",
                fixtureDigest: stableDigest({ caseId, fixture: "input" }),
                verifierDigest: stableDigest({
                  caseId,
                  verifier: "references",
                }),
              },
        output: {
          mediaType: "text/plain",
          maxBytes: 4000,
          requiredReferenceIds: evidence.map(({ id }) => id),
        },
      },
      evidence,
      contexts: {
        unconditioned: [],
        target_a: histories.target_a,
        target_b: histories.target_b,
      },
      lineage: {
        sourceIds: [`synthetic:${caseId}`],
        templateId: `judgment-history/${task.transferType}`,
      },
    });
    const evaluatorSemantic = {
      release: RELEASE_ID,
      caseId,
      pairId: pair.pairId,
      policy: {
        sharedVeto: {
          name: pair.veto.name,
          condition: pair.veto.condition,
          requiredAction: pair.veto.action,
        },
        target_a: {
          priorityCues: pair.a.cues,
          tieBreaker: pair.a.tie,
        },
        target_b: {
          priorityCues: pair.b.cues,
          tieBreaker: pair.b.tie,
        },
      },
      historyRoles: pair.history.map(({ role }) => role),
      criterion: criterion(task),
    };
    const evaluator = parseEvaluatorMaterial({
      ...evaluatorSemantic,
      evaluatorDigest: stableDigest(evaluatorSemantic),
    });

    await writeJson(
      resolve(root, "public", "cases", `${caseId}.json`),
      manifest,
    );
    await writeJson(
      resolve(root, "evaluator", "cases", `${caseId}.json`),
      evaluator,
    );

    entries.push({
      caseId,
      pairId: pair.pairId,
      form: task.form,
      domain: task.domain,
      transferType: task.transferType,
      taskArchetype: task.taskArchetype,
      taskMode: task.taskMode,
      casePath: `public/cases/${caseId}.json`,
      evaluatorPath: `evaluator/cases/${caseId}.json`,
      manifestDigest: manifest.manifestDigest,
      evaluatorDigest: evaluator.evaluatorDigest,
    });
    pairCases.push({
      caseId,
      domain: task.domain,
      transferType: task.transferType,
      form: task.form,
      taskMode: task.taskMode,
      taskArchetype: task.taskArchetype,
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
  pairs: samplingPairs,
  census,
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
  }),
  cases: entries,
});
await writeJson(resolve(root, "bank.json"), bank);

console.log(
  JSON.stringify(
    {
      bankDigest: bank.bankDigest,
      cases: entries.length,
      pairs: samplingPairs.length,
    },
    null,
    2,
  ),
);

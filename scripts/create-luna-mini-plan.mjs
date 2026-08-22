#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { stableDigest } from "../src/contracts.ts";

function parseArgs(args) {
  const parsed = {
    plan: "qualification/measurement-plan.json",
    output: null,
    batchId: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === "--plan" && value) parsed.plan = resolve(value);
    else if (flag === "--output" && value) parsed.output = resolve(value);
    else if (flag === "--batch-id" && value) parsed.batchId = value;
    else
      throw new TypeError(
        "usage: create-luna-mini-plan.mjs --batch-id <id> --output <json> [--plan <json>]",
      );
    index += 1;
  }
  if (!parsed.batchId || !/^[a-z0-9][a-z0-9-]{2,63}$/u.test(parsed.batchId))
    throw new TypeError("--batch-id must be a stable lowercase identifier");
  if (!parsed.output)
    throw new TypeError("--output is required so the plan is explicit");
  return parsed;
}

function selectEvenly(entries, count) {
  if (entries.length < count)
    throw new TypeError(
      `cannot select ${count} examples from ${entries.length}`,
    );
  const selected = [];
  const seen = new Set();
  for (let index = 0; index < count; index += 1) {
    const position = Math.round((index * (entries.length - 1)) / (count - 1));
    const entry = entries[position];
    if (seen.has(entry.exampleId)) continue;
    seen.add(entry.exampleId);
    selected.push(entry);
  }
  if (selected.length !== count)
    throw new TypeError("even selection produced duplicate example IDs");
  return selected;
}

const options = parseArgs(process.argv.slice(2));
const fullPlan = JSON.parse(await readFile(options.plan, "utf8"));
const byExample = new Map();
for (const entry of fullPlan.entries) {
  const rows = byExample.get(entry.exampleId) ?? [];
  rows.push(entry);
  byExample.set(entry.exampleId, rows);
}
const examplesByCondition = new Map();
for (const rows of byExample.values()) {
  const condition = rows[0].condition;
  if (rows.some((entry) => entry.condition !== condition))
    throw new TypeError(`example ${rows[0].exampleId} has mixed conditions`);
  const list = examplesByCondition.get(condition) ?? [];
  list.push({ exampleId: rows[0].exampleId, rows });
  examplesByCondition.set(condition, list);
}
const selected = [
  ...selectEvenly(examplesByCondition.get("target_a") ?? [], 4),
  ...selectEvenly(examplesByCondition.get("target_b") ?? [], 4),
  ...selectEvenly(examplesByCondition.get("unconditioned") ?? [], 4),
];
const entries = selected
  .flatMap((example) => example.rows)
  .sort((left, right) =>
    `${left.exampleId}\u0000${left.dimension}`.localeCompare(
      `${right.exampleId}\u0000${right.dimension}`,
    ),
  )
  .map(({ exampleId, dimension, condition }) => ({
    exampleId,
    dimension,
    condition,
  }));
const semantic = {
  artifact_type: "qualification_mini_measurement_plan",
  planId: `mini-${options.batchId}`,
  sourcePlanId: fullPlan.planId,
  sourcePlanDigest: fullPlan.planDigest,
  corpusDigest: fullPlan.corpusDigest,
  labelDigest: fullPlan.labelDigest,
  selection: {
    strategy: "four evenly spaced example IDs per condition",
    conditions: { target_a: 4, target_b: 4, unconditioned: 4 },
  },
  entries,
};
const output = { ...semantic, planDigest: stableDigest(semantic) };
await writeFile(options.output, `${JSON.stringify(output, null, 2)}\n`, "utf8");
process.stdout.write(
  `${JSON.stringify({
    output: options.output,
    planId: output.planId,
    planDigest: output.planDigest,
    exampleCount: selected.length,
    callCount: entries.length,
    conditionCounts: Object.fromEntries(
      Object.entries(Object.groupBy(entries, (entry) => entry.condition)).map(
        ([condition, rows]) => [condition, rows.length],
      ),
    ),
  })}\n`,
);

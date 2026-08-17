#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import { validateArtifact, renderCase } from "./artifact.ts";
import { validateBank } from "./bank.ts";
import {
  BENCHMARK_CONDITIONS,
  parseCaseManifest,
  type BenchmarkCondition,
} from "./contracts.ts";
import { auditBank } from "./data-audit.ts";

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function condition(value: string): BenchmarkCondition {
  if (!BENCHMARK_CONDITIONS.includes(value as BenchmarkCondition))
    throw new TypeError(
      `condition must be one of ${BENCHMARK_CONDITIONS.join(", ")}`,
    );
  return value as BenchmarkCondition;
}

function usage(): never {
  throw new TypeError(
    "usage: validate-bank <bank-root> | data-audit <bank-root> | render-case <case.json> <condition> <trial-id> | validate-output <case.json> <artifact>",
  );
}

async function main(args: readonly string[]) {
  const [operation, ...rest] = args;
  if (operation === "validate-bank" && rest.length === 1)
    return (await validateBank(rest[0]!)).manifest;
  if (operation === "data-audit" && rest.length === 1)
    return await auditBank(rest[0]!);
  if (operation === "render-case" && rest.length === 3)
    return renderCase(parseCaseManifest(await json(rest[0]!)), {
      condition: condition(rest[1]!),
      trialId: rest[2]!,
    });
  if (operation === "validate-output" && rest.length === 2)
    return validateArtifact(
      parseCaseManifest(await json(rest[0]!)),
      await readFile(rest[1]!),
    );
  usage();
}

main(process.argv.slice(2))
  .then((value) => process.stdout.write(`${JSON.stringify(value)}\n`))
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });

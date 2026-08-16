#!/usr/bin/env node

import { readFile } from "node:fs/promises";

import {
  createActivationAudit,
  parseActivationAuditInput,
} from "./activation.ts";
import { validateArtifact, renderCase } from "./artifact.ts";
import { validateBank } from "./bank.ts";
import {
  BENCHMARK_CONDITIONS,
  parseCaseManifest,
  type BenchmarkCondition,
} from "./contracts.ts";
import { deriveBenchmarkReport } from "./metrics.ts";
import {
  ANNOTATION_GROUPS,
  deriveHumanCriterion,
  deriveJudgeQualifications,
  parseQualificationStudy,
  projectAnnotationAssignments,
  type AnnotationGroup,
} from "./qualification.ts";
import { deriveReliabilityReport } from "./reliability.ts";

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    throw new TypeError(`unable to read JSON fixture ${path}`, {
      cause: error,
    });
  }
}

function print(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function usage(): never {
  throw new TypeError(
    "usage: validate-bank <bank-root> | render-case <case.json> <condition> <trial-id> | validate-output <case.json> <artifact> | report --fixture <fixture.json> | qualification-packet --study <study.json> --bank <bank-root> --group <group-id> | qualification --study <study.json> --bank <bank-root> --annotations <records.json> --votes <votes.json> | reliability --study <study.json> --bank <bank-root> --annotations <records.json> | activation-audit --bank <bank-root> --evidence <evidence.json>",
  );
}

function fixturePath(args: readonly string[]) {
  if (args.length !== 2 || args[0] !== "--fixture") usage();
  return args[1]!;
}

function qualificationPaths(args: readonly string[]) {
  if (
    args.length !== 8 ||
    args[0] !== "--study" ||
    args[2] !== "--bank" ||
    args[4] !== "--annotations" ||
    args[6] !== "--votes"
  )
    usage();
  return {
    study: args[1]!,
    bank: args[3]!,
    annotations: args[5]!,
    votes: args[7]!,
  };
}

function qualificationPacketPaths(args: readonly string[]) {
  if (
    args.length !== 6 ||
    args[0] !== "--study" ||
    args[2] !== "--bank" ||
    args[4] !== "--group"
  )
    usage();
  return { study: args[1]!, bank: args[3]!, group: args[5]! };
}

function parseAnnotationGroup(value: string): AnnotationGroup {
  if (!ANNOTATION_GROUPS.includes(value as AnnotationGroup))
    throw new TypeError(`group must be one of ${ANNOTATION_GROUPS.join(", ")}`);
  return value as AnnotationGroup;
}

function activationPaths(args: readonly string[]) {
  if (args.length !== 4 || args[0] !== "--bank" || args[2] !== "--evidence")
    usage();
  return { bank: args[1]!, evidence: args[3]! };
}

function parseCondition(value: string): BenchmarkCondition {
  if (!BENCHMARK_CONDITIONS.includes(value as BenchmarkCondition))
    throw new TypeError(
      `condition must be one of ${BENCHMARK_CONDITIONS.join(", ")}`,
    );
  return value as BenchmarkCondition;
}

async function main(args: readonly string[]) {
  const [operation, ...rest] = args;
  if (operation === "validate-bank" && rest.length === 1) {
    const bank = await validateBank(rest[0]!);
    return bank.manifest;
  }
  if (operation === "render-case" && rest.length === 3) {
    return renderCase(parseCaseManifest(await readJson(rest[0]!)), {
      condition: parseCondition(rest[1]!),
      trialId: rest[2]!,
    });
  }
  if (operation === "validate-output" && rest.length === 2) {
    return validateArtifact(
      parseCaseManifest(await readJson(rest[0]!)),
      await readFile(rest[1]!),
    );
  }
  if (operation === "report") {
    return deriveBenchmarkReport(await readJson(fixturePath(rest)));
  }
  if (operation === "qualification-packet") {
    const paths = qualificationPacketPaths(rest);
    const bank = await validateBank(paths.bank);
    const study = parseQualificationStudy(await readJson(paths.study), bank);
    const assignment = projectAnnotationAssignments(study, bank).find(
      ({ groupId }) => groupId === parseAnnotationGroup(paths.group),
    );
    if (!assignment) throw new TypeError("qualification assignment is missing");
    return assignment;
  }
  if (operation === "qualification") {
    const paths = qualificationPaths(rest);
    const bank = await validateBank(paths.bank);
    const study = parseQualificationStudy(await readJson(paths.study), bank);
    const annotations = await readJson(paths.annotations);
    const votes = await readJson(paths.votes);
    if (!Array.isArray(annotations) || !Array.isArray(votes))
      throw new TypeError("qualification records and votes must be arrays");
    return {
      release: study.release,
      studyId: study.studyId,
      studyDigest: study.studyDigest,
      humanCriterion: deriveHumanCriterion(study, bank, annotations),
      judgeQualification: deriveJudgeQualifications(
        study,
        bank,
        annotations,
        votes,
      ),
    };
  }
  if (operation === "reliability") {
    if (
      rest.length !== 6 ||
      rest[0] !== "--study" ||
      rest[2] !== "--bank" ||
      rest[4] !== "--annotations"
    )
      usage();
    const bank = await validateBank(rest[3]!);
    const study = parseQualificationStudy(await readJson(rest[1]!), bank);
    const annotations = await readJson(rest[5]!);
    if (!Array.isArray(annotations))
      throw new TypeError("reliability records must be an array");
    return deriveReliabilityReport(study, bank, annotations);
  }
  if (operation === "activation-audit") {
    const paths = activationPaths(rest);
    const bank = await validateBank(paths.bank);
    const input = parseActivationAuditInput(await readJson(paths.evidence));
    if (input.bankDigest !== bank.manifest.bankDigest)
      throw new TypeError(
        "activation evidence does not bind the validated bank",
      );
    return createActivationAudit(input);
  }
  usage();
}

void main(process.argv.slice(2)).then(print, (error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

import { validateBank } from "./bank.ts";
import { calibrateBank } from "./calibration.ts";
import {
  auditProspectiveBank,
  evaluateDraft,
  type DraftAdmissionInput,
  type ProspectiveBankInput,
} from "./admission.ts";
import { parseCaseBundle } from "./contracts.ts";
import { stableDigest } from "./identity.ts";
import {
  DOMAIN_BLUEPRINT_NAMES,
  materializeCampaign,
  parseDomainBlueprint,
  parsePerspectiveCatalog,
} from "./materializer.ts";
import { projectHarborTask } from "./projector.ts";

function invalidUsage(message: string) {
  const files = [{ file: ".", state: "invalid" as const, errors: [message] }];
  return { state: "invalid" as const, digest: stableDigest({ files }), files };
}

function invalidProjection(error: unknown) {
  return {
    state: "invalid" as const,
    error: error instanceof Error ? error.message : String(error),
  };
}

function runProject(caseFile: string, condition: string, destination: string) {
  try {
    return projectHarborTask(
      parseCaseBundle(JSON.parse(readFileSync(caseFile, "utf8"))),
      condition as "a" | "b" | "none" | "irrelevant",
      destination,
    );
  } catch (error) {
    return invalidProjection(error);
  }
}

function runCalibration(projectionRoot: string, artifact: string) {
  const root = resolve(projectionRoot);
  const verifierLogs = join(root, "calibration-logs");
  const result = spawnSync("sh", [join(root, "harbor", "tests", "test.sh")], {
    encoding: "utf8",
    env: {
      ...process.env,
      HARBOR_ARTIFACT: artifact,
      HARBOR_TEST_ROOT: join(root, "harbor", "tests"),
      HARBOR_VERIFIER_LOGS: verifierLogs,
    },
  });
  if (result.error !== undefined || result.stdout.length === 0) {
    return invalidProjection(
      (result.error ?? result.stderr) || "calibration failed",
    );
  }
  try {
    return JSON.parse(result.stdout) as Record<string, unknown>;
  } catch (error) {
    return invalidProjection(error);
  }
}

function runBankCalibration(bankRoot: string, workspace: string) {
  return calibrateBank(bankRoot, workspace);
}

function runAdmission(draftFile: string) {
  try {
    return evaluateDraft(
      JSON.parse(readFileSync(draftFile, "utf8")) as DraftAdmissionInput,
    );
  } catch (error) {
    return invalidProjection(error);
  }
}

function runBankAudit(campaignFile: string) {
  try {
    return auditProspectiveBank(
      JSON.parse(readFileSync(campaignFile, "utf8")) as ProspectiveBankInput,
    );
  } catch (error) {
    return invalidProjection(error);
  }
}

function runMaterializeBank(
  catalogFile: string,
  blueprintsRoot: string,
  destination: string,
) {
  try {
    const catalog = parsePerspectiveCatalog(
      JSON.parse(readFileSync(catalogFile, "utf8")),
    );
    const blueprints = DOMAIN_BLUEPRINT_NAMES.map((domain) =>
      parseDomainBlueprint(
        JSON.parse(
          readFileSync(join(blueprintsRoot, `${domain}.json`), "utf8"),
        ),
      ),
    );
    return materializeCampaign({ catalog, blueprints }, destination);
  } catch (error) {
    return invalidProjection(error);
  }
}

export function runCli(argv: readonly string[]): number {
  const [command, first, second, third] = argv;
  const report =
    argv.length === 7 &&
    command === "materialize-bank" &&
    first === "--catalog" &&
    second !== undefined &&
    third === "--blueprints" &&
    argv[4] !== undefined &&
    argv[5] === "--destination" &&
    argv[6] !== undefined
      ? runMaterializeBank(second, argv[4], argv[6])
      : argv.length === 2 && command === "validate" && first !== undefined
        ? validateBank(first)
        : argv.length === 2 && command === "admit" && first !== undefined
          ? runAdmission(first)
          : argv.length === 2 && command === "audit-bank" && first !== undefined
            ? runBankAudit(first)
            : argv.length === 4 &&
                command === "project" &&
                first !== undefined &&
                second !== undefined &&
                third !== undefined
              ? runProject(first, second, third)
              : argv.length === 3 &&
                  command === "calibrate-bank" &&
                  first !== undefined &&
                  second !== undefined
                ? runBankCalibration(first, second)
                : argv.length === 3 &&
                    command === "calibrate" &&
                    first !== undefined &&
                    second !== undefined
                  ? runCalibration(first, second)
                  : invalidUsage(
                      "usage: materialize-bank --catalog <path> --blueprints <dir> --destination <dir> | validate <bank-root> | admit <draft-file> | audit-bank <campaign-file> | project <case-file> <a|b|none|irrelevant> <destination> | calibrate <projection-root> <artifact> | calibrate-bank <bank-root> <empty-workspace>",
                    );
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (command === "calibrate" && "accepted" in report) {
    return report.accepted === true ? 0 : 1;
  }
  if (command === "admit" && "admitted" in report) {
    return report.admitted === true ? 0 : 1;
  }
  return "state" in report && report.state === "valid"
    ? 0
    : command === "project" && "projectionDigest" in report
      ? 0
      : 1;
}

process.exitCode = runCli(process.argv.slice(2));

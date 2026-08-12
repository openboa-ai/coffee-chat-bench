import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
import {
  createAttestationMac,
  judgeProjection,
  validateUnsignedAttestationShape,
} from "./judgment.ts";
import { createOpenAiResponsesTransport } from "./openai-judge.ts";
import { loadJudgeCampaignConfig } from "./judge-config.ts";

const EVAL_ATTESTATION_KEY_ENV = "COFFEE_CHAT_EVAL_ATTESTATION_KEY";
const EVAL_JUDGE_CAP_ENV = "COFFEE_CHAT_EVAL_JUDGE_CAP_NANO_USD";

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

async function runJudge(
  projectionRoot: string,
  artifact: string,
  attestation: string,
  capText: string | undefined,
) {
  const capabilityKey = process.env[EVAL_ATTESTATION_KEY_ENV] ?? "";
  delete process.env[EVAL_ATTESTATION_KEY_ENV];
  try {
    const baseConfig = loadJudgeCampaignConfig();
    const cap =
      capText === undefined ? baseConfig.campaignCapNanoUsd : Number(capText);
    if (
      !Number.isSafeInteger(cap) ||
      cap < 0 ||
      cap > baseConfig.campaignCapNanoUsd ||
      (String(cap) !== capText && capText !== undefined)
    ) {
      throw new TypeError(
        "judge cap must be a canonical bounded nano-USD integer",
      );
    }
    return await judgeProjection({
      projectionRoot,
      artifactPath: artifact,
      attestationPath: attestation,
      capabilityKey,
      judgeCampaignCapNanoUsd: cap,
      createTransport: createOpenAiResponsesTransport,
    });
  } catch (error) {
    return invalidProjection(error);
  }
}

function runAttest(
  unsignedPath: string,
  signedPath: string,
  capabilityKey: string,
) {
  try {
    const value = JSON.parse(readFileSync(unsignedPath, "utf8")) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("unsigned attestation must be a JSON object");
    }
    const attestation = value as Record<string, unknown>;
    if (Object.hasOwn(attestation, "attestationMac")) {
      throw new TypeError(
        "attest requires one unsigned isolated-verifier attestation",
      );
    }
    validateUnsignedAttestationShape(attestation);
    const signed = {
      ...attestation,
      attestationMac: createAttestationMac(attestation, capabilityKey),
    };
    writeFileSync(signedPath, `${JSON.stringify(signed)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return { state: "signed" as const };
  } catch (error) {
    return invalidProjection(error);
  }
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const [command, first, second, third] = argv;
  const judgeCapText = process.env[EVAL_JUDGE_CAP_ENV];
  delete process.env[EVAL_JUDGE_CAP_ENV];
  const attestCapabilityKey =
    command === "attest" ? (process.env[EVAL_ATTESTATION_KEY_ENV] ?? "") : "";
  if (command === "attest") delete process.env[EVAL_ATTESTATION_KEY_ENV];
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
                  command === "attest" &&
                  first !== undefined &&
                  second !== undefined
                ? runAttest(first, second, attestCapabilityKey)
                : argv.length === 3 &&
                    command === "calibrate-bank" &&
                    first !== undefined &&
                    second !== undefined
                  ? runBankCalibration(first, second)
                  : argv.length === 4 &&
                      command === "judge" &&
                      first !== undefined &&
                      second !== undefined &&
                      third !== undefined
                    ? await runJudge(first, second, third, judgeCapText)
                    : invalidUsage(
                        "usage: materialize-bank --catalog <path> --blueprints <dir> --destination <dir> | validate <bank-root> | admit <draft-file> | audit-bank <campaign-file> | project <case-file> <a|b|none|irrelevant> <destination> | attest <unsigned-attestation> <signed-attestation> | calibrate-bank <bank-root> <empty-workspace> | judge <projection-root> <artifact> <isolated-verifier-attestation>",
                      );
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (command === "judge" && "state" in report) {
    return report.state === "measured" ? 0 : 1;
  }
  if (command === "admit" && "admitted" in report) {
    return report.admitted === true ? 0 : 1;
  }
  if (command === "attest" && "state" in report) {
    return report.state === "signed" ? 0 : 1;
  }
  return "state" in report && report.state === "valid"
    ? 0
    : command === "project" && "projectionDigest" in report
      ? 0
      : 1;
}

process.exitCode = await runCli(process.argv.slice(2));

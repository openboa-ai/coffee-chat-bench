import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  calibratePreparedBank,
  calibrateBank,
  projectCalibrationBank,
} from "../src/calibration.ts";
import {
  DOMAIN_BLUEPRINT_NAMES,
  materializeCampaign,
  parseDomainBlueprint,
  parsePerspectiveCatalog,
} from "../src/materializer.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const campaignRoot = join(repositoryRoot, "bank", "campaign");

function temporaryDirectory(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function treeBytes(root: string): Readonly<Record<string, string>> {
  const files: Record<string, string> = {};
  const visit = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory).sort()) {
      const path = join(directory, entry);
      const relative = `${prefix}${entry}`;
      if (lstatSync(path).isDirectory()) {
        visit(path, `${relative}/`);
      } else {
        files[relative] = readFileSync(path, "utf8");
      }
    }
  };
  visit(root, "");
  return files;
}

function runCli(args: readonly string[]) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", "src/cli.ts", ...args],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
}

test("checked-in campaign reproduces the current authored catalog and blueprints byte-for-byte", () => {
  const root = temporaryDirectory("coffee-chat-campaign-parity-");
  const destination = join(root, "campaign");
  try {
    const catalog = parsePerspectiveCatalog(
      JSON.parse(
        readFileSync(join(repositoryRoot, "perspectives/catalog.json"), "utf8"),
      ),
    );
    const blueprints = DOMAIN_BLUEPRINT_NAMES.map((domain) =>
      parseDomainBlueprint(
        JSON.parse(
          readFileSync(
            join(repositoryRoot, "bank", "blueprints", `${domain}.json`),
            "utf8",
          ),
        ),
      ),
    );

    const result = materializeCampaign({ catalog, blueprints }, destination);
    const checkedInCampaign = JSON.parse(
      readFileSync(join(campaignRoot, "campaign.json"), "utf8"),
    ) as Record<string, unknown>;

    assert.deepEqual(
      result.sourceBlueprintDigests,
      checkedInCampaign.sourceBlueprintDigests,
    );
    assert.equal(result.prospectiveDigest, checkedInCampaign.prospectiveDigest);
    assert.equal(
      result.selectedBankDigest,
      checkedInCampaign.selectedBankDigest,
    );
    assert.deepEqual(result.counts, checkedInCampaign.counts);
    assert.deepEqual(treeBytes(destination), treeBytes(campaignRoot));
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("full-bank calibration CLI verifies all 288 projected conditions through their generated verifier", () => {
  const root = temporaryDirectory("coffee-chat-calibration-cli-");
  const workspace = join(root, "workspace");
  try {
    const result = runCli(["calibrate-bank", campaignRoot, workspace]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      readonly state: string;
      readonly reportDigest: string;
      readonly counts: Record<string, number>;
      readonly projections: ReadonlyArray<{
        readonly caseId: string;
        readonly familyId: string;
        readonly condition: string;
        readonly trialId: string;
        readonly sourceDigest: string;
        readonly oracle: {
          readonly state: string;
          readonly accepted: boolean;
          readonly criticalFailure: boolean;
        };
        readonly noOp: { readonly state: string; readonly accepted: boolean };
        readonly listAll: {
          readonly state: string;
          readonly accepted: boolean;
        };
      }>;
      readonly failures: readonly unknown[];
    };
    assert.deepEqual(
      {
        state: report.state,
        expectedProjections: report.counts.expectedProjections,
        projectedProjections: report.counts.projectedProjections,
        expectedControlRuns: report.counts.expectedControlRuns,
        completedControlRuns: report.counts.completedControlRuns,
        failures: report.failures.length,
      },
      {
        state: "valid",
        expectedProjections: 288,
        projectedProjections: 288,
        expectedControlRuns: 864,
        completedControlRuns: 864,
        failures: 0,
      },
    );
    assert.match(report.reportDigest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(report.projections.length, 288);
    assert.equal(
      report.projections.every(
        (projection) =>
          projection.caseId.length > 0 &&
          projection.familyId.length > 0 &&
          projection.sourceDigest.startsWith("sha256:") &&
          projection.trialId.startsWith("trial-") &&
          ["T0", "T1-A", "T1-B"].includes(projection.condition) &&
          projection.oracle.state === "measured" &&
          projection.oracle.accepted === true &&
          projection.oracle.criticalFailure === false &&
          projection.noOp.state === "candidate_invalid" &&
          projection.noOp.accepted === false &&
          projection.listAll.state === "candidate_failure" &&
          projection.listAll.accepted === false,
      ),
      true,
    );
    assert.equal(existsSync(workspace), false);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("full-bank calibration subprocess receives only PATH and locale, including its generated verifier", () => {
  const root = temporaryDirectory("coffee-chat-calibration-env-");
  const workspace = join(root, "workspace");
  const bin = join(root, "bin");
  const observedEnvironment = join(root, "subprocess-environment.txt");
  const realPython = spawnSync(
    "python3",
    ["-c", "import sys; print(sys.executable)"],
    {
      encoding: "utf8",
    },
  );
  const environmentKeys = [
    "PATH",
    "LANG",
    "LC_ALL",
    "OPENAI_API_KEY",
    "COFFEE_CHAT_EVAL_ATTESTATION_KEY",
    "HOST_AUTH_TOKEN",
    "PROVIDER_TOKEN",
  ] as const;
  const originalEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
  );
  try {
    assert.equal(realPython.status, 0, realPython.stderr);
    mkdirSync(bin);
    writeFileSync(
      join(bin, "python3"),
      `#!${process.execPath}\nconst { writeFileSync } = require("node:fs");\nconst { spawnSync } = require("node:child_process");\nwriteFileSync(${JSON.stringify(observedEnvironment)}, JSON.stringify(process.env));\nconst result = spawnSync(${JSON.stringify(realPython.stdout.trim())}, process.argv.slice(2), { env: process.env, stdio: "inherit" });\nprocess.exitCode = result.status ?? 1;\n`,
      { encoding: "utf8", mode: 0o755 },
    );
    process.env.PATH = `${bin}:${originalEnvironment.PATH ?? ""}`;
    process.env.OPENAI_API_KEY = "must-not-reach-calibration";
    process.env.COFFEE_CHAT_EVAL_ATTESTATION_KEY = "must-not-reach-calibration";
    process.env.HOST_AUTH_TOKEN = "must-not-reach-calibration";
    process.env.PROVIDER_TOKEN = "must-not-reach-calibration";

    const report = calibrateBank(campaignRoot, workspace);
    assert.equal(report.state, "valid");
    const observed = JSON.parse(
      readFileSync(observedEnvironment, "utf8"),
    ) as Record<string, string>;
    const observedKeys = Object.keys(observed).sort();
    assert.equal(observedKeys.includes("PATH"), true);
    assert.equal(observedKeys.includes("LANG"), true);
    assert.equal(observedKeys.includes("LC_ALL"), true);
    assert.equal(
      observedKeys.every((key) =>
        ["PATH", "LANG", "LC_ALL", "__CF_USER_TEXT_ENCODING"].includes(key),
      ),
      true,
    );
    for (const value of [
      "must-not-reach-calibration",
      "OPENAI_API_KEY",
      "COFFEE_CHAT_EVAL_ATTESTATION_KEY",
      "HOST_AUTH_TOKEN",
      "PROVIDER_TOKEN",
    ]) {
      assert.equal(JSON.stringify(observed).includes(value), false, value);
    }
  } finally {
    for (const key of environmentKeys) {
      const value = originalEnvironment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(root, { force: true, recursive: true });
  }
});

test("calibration marks a deliberately mutated projected Oracle as a named failure", () => {
  const root = temporaryDirectory("coffee-chat-calibration-oracle-");
  const workspace = join(root, "workspace");
  try {
    const projected = projectCalibrationBank(campaignRoot, workspace);
    const first = projected.projections[0]!;
    const oracle = first.oracleArtifact;
    const value = JSON.parse(readFileSync(oracle, "utf8")) as {
      manifest: { decisions: Array<{ selectedRegion: string }> };
    };
    value.manifest.decisions[0]!.selectedRegion = "not-an-accepted-region";
    writeFileSync(oracle, `${JSON.stringify(value)}\n`, "utf8");

    const report = calibratePreparedBank(projected);
    assert.equal(report.state, "invalid");
    assert.equal(report.counts.expectedProjections, 288);
    assert.equal(report.counts.completedControlRuns, 864);
    assert.equal(
      report.failures.some(
        (failure) =>
          failure.caseId === first.caseId &&
          failure.condition === first.condition &&
          failure.control === "oracle",
      ),
      true,
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("calibration never imports a forged projected verifier", () => {
  const root = temporaryDirectory("coffee-chat-calibration-forged-verifier-");
  const workspace = join(root, "workspace");
  const marker = join(root, "forged-verifier-executed");
  try {
    const projected = projectCalibrationBank(campaignRoot, workspace);
    writeFileSync(
      join(
        projected.workspace,
        "projections",
        "000-none",
        "harbor",
        "tests",
        "verifier.py",
      ),
      `from pathlib import Path\nPath(${JSON.stringify(marker)}).write_text("executed", encoding="utf-8")\n`,
      "utf8",
    );

    const report = calibratePreparedBank(projected);
    assert.equal(existsSync(marker), false);
    assert.equal(report.state, "valid");
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("calibration retains exact identities when projection generation fails", () => {
  const root = temporaryDirectory(
    "coffee-chat-calibration-projection-failure-",
  );
  const workspace = join(root, "workspace");
  const verifier = join(repositoryRoot, "harbor", "verifier.py");
  const unavailableVerifier = join(root, "verifier.py");
  try {
    writeFileSync(unavailableVerifier, readFileSync(verifier, "utf8"), "utf8");
    unlinkSync(verifier);

    const report = calibrateBank(campaignRoot, workspace);

    assert.equal(report.state, "invalid");
    assert.equal(report.counts.expectedProjections, 288);
    assert.equal(report.counts.projectedProjections, 0);
    assert.equal(report.counts.expectedControlRuns, 864);
    assert.equal(report.counts.completedControlRuns, 0);
    assert.equal(report.failures.length, 288);
    assert.equal(
      report.failures.every(
        (failure) =>
          failure.kind === "projection" &&
          typeof failure.caseId === "string" &&
          typeof failure.familyId === "string" &&
          ["T0", "T1-A", "T1-B"].includes(failure.condition ?? "") &&
          typeof failure.trialId === "string" &&
          failure.trialId.startsWith("trial-") &&
          typeof failure.sourceDigest === "string" &&
          failure.sourceDigest.startsWith("sha256:") &&
          /ENOENT|verifier\.py/u.test(failure.message),
      ),
      true,
    );
    assert.equal(
      new Set(
        report.failures.map(
          (failure) =>
            `${failure.caseId}|${failure.familyId}|${failure.condition}|${failure.trialId}|${failure.sourceDigest}`,
        ),
      ).size,
      288,
    );
    assert.equal(existsSync(workspace), false);
  } finally {
    if (existsSync(unavailableVerifier)) {
      writeFileSync(
        verifier,
        readFileSync(unavailableVerifier, "utf8"),
        "utf8",
      );
    }
    rmSync(root, { force: true, recursive: true });
  }
});

test("calibration rejects a missing case without shrinking the 288-condition denominator", () => {
  const root = temporaryDirectory("coffee-chat-calibration-missing-");
  const bank = join(root, "campaign");
  const workspace = join(root, "workspace");
  try {
    cpSync(campaignRoot, bank, { recursive: true });
    unlinkSync(join(bank, "development", "000.json"));
    const result = runCli(["calibrate-bank", bank, workspace]);
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout) as {
      readonly state: string;
      readonly counts: Record<string, number>;
      readonly failures: ReadonlyArray<{
        readonly kind: string;
        readonly message: string;
      }>;
    };
    assert.equal(report.state, "invalid");
    assert.equal(report.counts.expectedProjections, 288);
    assert.equal(report.counts.projectedProjections, 0);
    assert.equal(
      report.failures.some(
        (failure) =>
          failure.kind === "bank" &&
          /development|24|missing/i.test(failure.message),
      ),
      true,
    );

    mkdirSync(workspace);
    writeFileSync(join(workspace, "owner.txt"), "do not touch\n", "utf8");
    const nonEmpty = runCli(["calibrate-bank", campaignRoot, workspace]);
    assert.equal(nonEmpty.status, 1, nonEmpty.stderr);
    assert.equal(
      readFileSync(join(workspace, "owner.txt"), "utf8"),
      "do not touch\n",
    );

    const target = join(root, "target");
    const linked = join(root, "linked");
    mkdirSync(target);
    writeFileSync(join(target, "owner.txt"), "target is private\n", "utf8");
    symlinkSync(target, linked, "dir");
    const symlinked = runCli([
      "calibrate-bank",
      campaignRoot,
      join(linked, "workspace"),
    ]);
    assert.equal(symlinked.status, 1, symlinked.stderr);
    assert.equal(
      readFileSync(join(target, "owner.txt"), "utf8"),
      "target is private\n",
    );

    const existing = join(target, "existing");
    mkdirSync(existing);
    const nestedSymlinked = runCli([
      "calibrate-bank",
      bank,
      join(linked, "existing", "workspace"),
    ]);
    assert.equal(nestedSymlinked.status, 1, nestedSymlinked.stderr);
    const nestedReport = JSON.parse(nestedSymlinked.stdout) as {
      readonly failures: ReadonlyArray<{ readonly message: string }>;
    };
    assert.match(
      nestedReport.failures.map(({ message }) => message).join(" "),
      /symbolic link.*ancestor/i,
    );
    assert.deepEqual(readdirSync(existing), []);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

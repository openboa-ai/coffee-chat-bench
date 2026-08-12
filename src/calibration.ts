import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import { validateBank } from "./bank.ts";
import {
  parseCaseBundle,
  RELEASE_ID,
  type CaseBundle,
  type ConditionLabel,
  type Digest,
} from "./contracts.ts";
import { stableDigest } from "./digest.ts";
import {
  projectedTrialId,
  projectHarborTask,
  type HarborCondition,
} from "./projector.ts";

const PARTITIONS = [
  ["development", 24],
  ["calibration", 24],
  ["release", 40],
  ["bridge", 8],
] as const;
const CONDITIONS = [
  ["none", "T0"],
  ["a", "T1-A"],
  ["b", "T1-B"],
] as const satisfies readonly [HarborCondition, ConditionLabel][];
const EXPECTED_CASES = 96;
const EXPECTED_PROJECTIONS = EXPECTED_CASES * CONDITIONS.length;
const CONTROLS = ["oracle", "noOp", "listAll"] as const;

export type CalibrationControl = (typeof CONTROLS)[number];
export type CalibrationOutcomeState =
  | "measured"
  | "candidate_invalid"
  | "candidate_failure"
  | "verifier_failure"
  | "calibration_failure";

export interface CalibrationOutcome {
  readonly state: CalibrationOutcomeState;
  readonly accepted: boolean;
  readonly criticalFailure: boolean;
  readonly reasons: readonly string[];
}

export interface CalibrationProjection {
  readonly caseId: string;
  readonly familyId: string;
  readonly condition: ConditionLabel;
  readonly trialId: string;
  readonly sourceDigest: Digest;
  readonly projectionDirectory: string;
  readonly verifierDirectory: string;
  readonly oracleArtifact: string;
  readonly noOpArtifact: string;
  readonly listAllArtifact: string;
}

export interface ProjectedCalibrationBank {
  readonly bankDigest: Digest;
  readonly workspace: string;
  readonly projections: readonly CalibrationProjection[];
  readonly projectionFailures: readonly CalibrationFailure[];
}

export interface CalibrationFailure {
  readonly kind: "bank" | "projection" | "process" | "verifier";
  readonly message: string;
  readonly caseId?: string;
  readonly familyId?: string;
  readonly condition?: ConditionLabel;
  readonly trialId?: string;
  readonly sourceDigest?: Digest;
  readonly control?: CalibrationControl;
}

export interface CalibrationProjectionReport {
  readonly caseId: string;
  readonly familyId: string;
  readonly condition: ConditionLabel;
  readonly trialId: string;
  readonly sourceDigest: Digest;
  readonly oracle: CalibrationOutcome;
  readonly noOp: CalibrationOutcome;
  readonly listAll: CalibrationOutcome;
}

export interface CalibrationReport {
  readonly release: typeof RELEASE_ID;
  readonly state: "valid" | "invalid";
  readonly bankDigest: Digest | null;
  readonly reportDigest: Digest;
  readonly counts: {
    readonly expectedProjections: number;
    readonly projectedProjections: number;
    readonly expectedControlRuns: number;
    readonly completedControlRuns: number;
  };
  readonly projections: readonly CalibrationProjectionReport[];
  readonly failures: readonly CalibrationFailure[];
}

interface LoadedCampaign {
  readonly bankDigest: Digest;
  readonly cases: readonly CaseBundle[];
}

interface BatchRequest {
  readonly id: string;
  readonly verifier: string;
  readonly judgment: string;
  readonly artifact: string;
}

interface BatchVerdict {
  readonly state: string;
  readonly accepted: boolean;
  readonly criticalFailure: boolean;
  readonly reasons: readonly string[];
}

interface BatchResult {
  readonly id: string;
  readonly verdict?: BatchVerdict;
  readonly error?: string;
}

interface BatchRun {
  readonly results: readonly BatchResult[];
  readonly failures: readonly CalibrationFailure[];
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError(`${label} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireDigest(value: unknown, label: string): Digest {
  const digest = requireString(value, label);
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) {
    throw new TypeError(`${label} must be a sha256 digest`);
  }
  return digest as Digest;
}

function readJson(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new TypeError(`${label}: ${asMessage(error)}`);
  }
}

function assertSafeWorkspacePath(destination: string): string {
  const root = resolve(destination);
  let current = root;
  while (true) {
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) {
        throw new TypeError(
          `calibration workspace has a symbolic link ancestor: ${current}`,
        );
      }
      if (current !== root && !stat.isDirectory()) {
        throw new TypeError(
          `calibration workspace ancestor must be a directory: ${current}`,
        );
      }
      break;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        const parent = dirname(current);
        if (parent === current) {
          throw new TypeError(
            "calibration workspace must have an existing parent directory",
          );
        }
        current = parent;
        continue;
      }
      throw error;
    }
  }
  if (existsSync(root)) {
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new TypeError("calibration workspace must be a real directory");
    }
    if (readdirSync(root).length > 0) {
      throw new TypeError("calibration workspace must be empty");
    }
  } else {
    mkdirSync(root, { recursive: true });
  }
  return root;
}

function loadCampaign(bankRoot: string): LoadedCampaign {
  const root = resolve(bankRoot);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new TypeError("campaign root must be a real directory");
  }
  const campaign = requireRecord(
    readJson(join(root, "campaign.json"), "campaign metadata"),
    "campaign metadata",
  );
  const counts = requireRecord(campaign.counts, "campaign metadata counts");
  const campaignDigest = requireDigest(
    campaign.selectedBankDigest,
    "campaign selectedBankDigest",
  );
  const expectedCounts: Readonly<Record<string, number>> = {
    prospective: 144,
    admitted: EXPECTED_CASES,
    rejected: 48,
    development: 24,
    calibration: 24,
    release: 40,
    bridge: 8,
  };
  for (const [name, expected] of Object.entries(expectedCounts)) {
    if (counts[name] !== expected) {
      throw new TypeError(`campaign metadata ${name} must be ${expected}`);
    }
  }

  const cases: CaseBundle[] = [];
  const entries: Array<{
    readonly partition: string;
    readonly file: string;
    readonly caseBundle: CaseBundle;
  }> = [];
  for (const [partition, expectedCount] of PARTITIONS) {
    const partitionRoot = join(root, partition);
    const validation = validateBank(partitionRoot);
    if (validation.state !== "valid") {
      throw new TypeError(
        `${partition} partition is invalid: ${validation.files
          .flatMap((file) => file.errors)
          .join("; ")}`,
      );
    }
    const files = readdirSync(partitionRoot)
      .filter((file) => file.endsWith(".json"))
      .sort();
    if (files.length !== expectedCount) {
      throw new TypeError(
        `${partition} partition must contain exactly ${expectedCount} cases; found ${files.length}`,
      );
    }
    for (const file of files) {
      const caseBundle = parseCaseBundle(
        readJson(join(partitionRoot, file), `${partition}/${file}`),
      );
      cases.push(caseBundle);
      entries.push({ partition, file, caseBundle });
    }
  }
  if (cases.length !== EXPECTED_CASES) {
    throw new TypeError(
      `campaign must contain exactly ${EXPECTED_CASES} admitted cases; found ${cases.length}`,
    );
  }
  if (stableDigest(entries) !== campaignDigest) {
    throw new TypeError(
      "campaign selected-bank digest does not match case files",
    );
  }
  return { bankDigest: campaignDigest, cases };
}

function artifactWithDigest(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const manifest = requireRecord(value.manifest, "artifact manifest");
  const digestInput = {
    ...value,
    manifest: Object.fromEntries(
      Object.entries(manifest).filter(([key]) => key !== "artifactDigest"),
    ),
  };
  return {
    ...value,
    manifest: { ...manifest, artifactDigest: stableDigest(digestInput) },
  };
}

function writeControlArtifacts(
  projectionDirectory: string,
  verifierDirectory: string,
): Pick<
  CalibrationProjection,
  "oracleArtifact" | "noOpArtifact" | "listAllArtifact"
> {
  const controls = join(projectionDirectory, "controls");
  mkdirSync(controls, { recursive: true });
  const oracle = requireRecord(
    readJson(join(verifierDirectory, "oracle.json"), "generated Oracle"),
    "generated Oracle",
  );
  const judgment = requireRecord(
    readJson(join(verifierDirectory, "judgment.json"), "projected judgment"),
    "projected judgment",
  );
  const decisions = judgment.decisions;
  if (!Array.isArray(decisions)) {
    throw new TypeError("projected judgment decisions must be an array");
  }
  const acceptedRegions = decisions.flatMap((entry, index) => {
    const decision = requireRecord(
      entry,
      `projected judgment decisions[${index}]`,
    );
    if (!Array.isArray(decision.acceptedRegions)) {
      throw new TypeError(
        `projected judgment decisions[${index}].acceptedRegions must be an array`,
      );
    }
    return decision.acceptedRegions.map((region, regionIndex) =>
      requireString(
        region,
        `projected judgment decisions[${index}].acceptedRegions[${regionIndex}]`,
      ),
    );
  });
  const noOp = artifactWithDigest({
    ...oracle,
    manifest: {
      ...requireRecord(oracle.manifest, "generated Oracle manifest"),
      decisions: [],
    },
    response: "No decisions were selected.",
    accessedPaths: [],
  });
  const listAll = artifactWithDigest({
    ...oracle,
    response: `All applicable regions: ${acceptedRegions.join(", ")}.`,
    accessedPaths: [],
  });
  const oracleArtifact = join(controls, "oracle.json");
  const noOpArtifact = join(controls, "no-op.json");
  const listAllArtifact = join(controls, "list-all.json");
  writeFileSync(oracleArtifact, `${JSON.stringify(oracle, null, 2)}\n`, "utf8");
  writeFileSync(noOpArtifact, `${JSON.stringify(noOp, null, 2)}\n`, "utf8");
  writeFileSync(
    listAllArtifact,
    `${JSON.stringify(listAll, null, 2)}\n`,
    "utf8",
  );
  return { oracleArtifact, noOpArtifact, listAllArtifact };
}

export function projectCalibrationBank(
  bankRoot: string,
  workspace: string,
): ProjectedCalibrationBank {
  const campaign = loadCampaign(bankRoot);
  const root = assertSafeWorkspacePath(workspace);
  const projections: CalibrationProjection[] = [];
  const projectionFailures: CalibrationFailure[] = [];
  for (const [caseIndex, caseBundle] of campaign.cases.entries()) {
    for (const [condition, label] of CONDITIONS) {
      const projectionDirectory = join(
        root,
        "projections",
        `${caseIndex.toString().padStart(3, "0")}-${condition}`,
      );
      try {
        const projected = projectHarborTask(
          caseBundle,
          condition,
          projectionDirectory,
        );
        const task = requireRecord(
          readJson(
            join(projected.candidateDirectory, "task.json"),
            "projected task",
          ),
          "projected task",
        );
        const trialId = requireString(task.trialId, "projected task trialId");
        const controls = writeControlArtifacts(
          projectionDirectory,
          projected.verifierDirectory,
        );
        projections.push({
          caseId: caseBundle.caseId,
          familyId: caseBundle.familyId,
          condition: label,
          trialId,
          sourceDigest: caseBundle.sourceDigest,
          projectionDirectory,
          verifierDirectory: projected.verifierDirectory,
          ...controls,
        });
      } catch (error) {
        projectionFailures.push({
          kind: "projection",
          message: `calibration projection failed: ${asMessage(error)}`,
          caseId: caseBundle.caseId,
          familyId: caseBundle.familyId,
          condition: label,
          trialId: projectedTrialId(caseBundle, condition),
          sourceDigest: caseBundle.sourceDigest,
        });
      }
    }
  }
  if (projections.length + projectionFailures.length !== EXPECTED_PROJECTIONS) {
    throw new TypeError(
      `campaign projection count must be ${EXPECTED_PROJECTIONS}; found ${projections.length + projectionFailures.length}`,
    );
  }
  return {
    bankDigest: campaign.bankDigest,
    workspace: root,
    projections,
    projectionFailures,
  };
}

function batchRequests(
  projections: readonly CalibrationProjection[],
): readonly BatchRequest[] {
  return projections.flatMap((projection, projectionIndex) =>
    CONTROLS.map((control) => ({
      id: `${projectionIndex}:${control}`,
      verifier: join(
        projection.projectionDirectory,
        "harbor",
        "tests",
        "verifier.py",
      ),
      judgment: join(
        projection.projectionDirectory,
        "harbor",
        "tests",
        "judgment.json",
      ),
      artifact:
        control === "oracle"
          ? projection.oracleArtifact
          : control === "noOp"
            ? projection.noOpArtifact
            : projection.listAllArtifact,
    })),
  );
}

function parseBatchRun(value: unknown): readonly BatchResult[] {
  const record = requireRecord(value, "calibration verifier batch");
  if (!Array.isArray(record.results)) {
    throw new TypeError("calibration verifier batch results must be an array");
  }
  return record.results.map((entry, index) => {
    const result = requireRecord(
      entry,
      `calibration verifier batch result ${index}`,
    );
    const id = requireString(
      result.id,
      `calibration verifier batch result ${index}.id`,
    );
    if (typeof result.error === "string") return { id, error: result.error };
    const verdict = requireRecord(
      result.verdict,
      `calibration verifier batch result ${index}.verdict`,
    );
    if (
      typeof verdict.state !== "string" ||
      typeof verdict.accepted !== "boolean" ||
      typeof verdict.criticalFailure !== "boolean" ||
      !Array.isArray(verdict.reasons) ||
      !verdict.reasons.every((reason) => typeof reason === "string")
    ) {
      throw new TypeError(
        `calibration verifier batch result ${index} has malformed verdict`,
      );
    }
    return {
      id,
      verdict: {
        state: verdict.state,
        accepted: verdict.accepted,
        criticalFailure: verdict.criticalFailure,
        reasons: verdict.reasons,
      },
    };
  });
}

function runVerifierBatch(input: ProjectedCalibrationBank): BatchRun {
  const requests = batchRequests(input.projections);
  const requestFile = join(input.workspace, "verifier-batch.json");
  writeFileSync(requestFile, `${JSON.stringify({ requests })}\n`, "utf8");
  const runner = new URL("../harbor/calibrate.py", import.meta.url);
  const process = spawnSync(
    "python3",
    [runner.pathname, "--requests", requestFile],
    {
      encoding: "utf8",
    },
  );
  if (process.error !== undefined) {
    return {
      results: [],
      failures: [
        {
          kind: "process",
          message: `calibration verifier batch could not start: ${asMessage(process.error)}`,
        },
      ],
    };
  }
  if (process.status !== 0) {
    return {
      results: [],
      failures: [
        {
          kind: "process",
          message: `calibration verifier batch failed: ${process.stderr.trim() || process.stdout.trim() || "unknown process failure"}`,
        },
      ],
    };
  }
  try {
    const results = parseBatchRun(JSON.parse(process.stdout) as unknown);
    if (results.length !== requests.length) {
      throw new TypeError(
        `calibration verifier batch returned ${results.length} results; expected ${requests.length}`,
      );
    }
    const actualIds = new Set(results.map((result) => result.id));
    if (
      actualIds.size !== requests.length ||
      requests.some((request) => !actualIds.has(request.id))
    ) {
      throw new TypeError(
        "calibration verifier batch returned mismatched result IDs",
      );
    }
    return { results, failures: [] };
  } catch (error) {
    return {
      results: [],
      failures: [
        {
          kind: "process",
          message: `calibration verifier batch returned malformed output: ${asMessage(error)}`,
        },
      ],
    };
  }
}

function failedOutcome(reason: string): CalibrationOutcome {
  return {
    state: "calibration_failure",
    accepted: false,
    criticalFailure: false,
    reasons: [reason],
  };
}

function normalizeOutcome(
  control: CalibrationControl,
  result: BatchResult | undefined,
): CalibrationOutcome {
  if (result === undefined)
    return failedOutcome("missing verifier batch result");
  if (result.error !== undefined) return failedOutcome(result.error);
  const verdict = result.verdict;
  if (verdict === undefined) return failedOutcome("missing verifier verdict");
  const state =
    control === "oracle" &&
    verdict.state === "unmeasured" &&
    verdict.accepted === true &&
    verdict.criticalFailure === false
      ? "measured"
      : verdict.state === "candidate_invalid" ||
          verdict.state === "candidate_failure" ||
          verdict.state === "verifier_failure"
        ? verdict.state
        : "calibration_failure";
  return {
    state,
    accepted: verdict.accepted,
    criticalFailure: verdict.criticalFailure,
    reasons: verdict.reasons,
  };
}

function expectationFailure(
  projection: CalibrationProjection,
  control: CalibrationControl,
  outcome: CalibrationOutcome,
): CalibrationFailure | null {
  const expected =
    control === "oracle"
      ? { state: "measured", accepted: true, criticalFailure: false }
      : control === "noOp"
        ? { state: "candidate_invalid", accepted: false }
        : { state: "candidate_failure", accepted: false };
  if (
    outcome.state === expected.state &&
    outcome.accepted === expected.accepted &&
    ("criticalFailure" in expected
      ? outcome.criticalFailure === expected.criticalFailure
      : true)
  ) {
    return null;
  }
  return {
    kind: "verifier",
    message: `${control} expected ${expected.state}/${String(expected.accepted)} but received ${outcome.state}/${String(outcome.accepted)}: ${outcome.reasons.join("; ")}`,
    caseId: projection.caseId,
    familyId: projection.familyId,
    condition: projection.condition,
    trialId: projection.trialId,
    sourceDigest: projection.sourceDigest,
    control,
  };
}

function finalReport(
  bankDigest: Digest | null,
  projectedProjections: number,
  projections: readonly CalibrationProjectionReport[],
  failures: readonly CalibrationFailure[],
  completedControlRuns: number,
): CalibrationReport {
  const payload = {
    release: RELEASE_ID,
    state: failures.length === 0 ? ("valid" as const) : ("invalid" as const),
    bankDigest,
    counts: {
      expectedProjections: EXPECTED_PROJECTIONS,
      projectedProjections,
      expectedControlRuns: EXPECTED_PROJECTIONS * CONTROLS.length,
      completedControlRuns,
    },
    projections,
    failures,
  };
  return { ...payload, reportDigest: stableDigest(payload) };
}

export function calibrateProjectedBank(
  input: ProjectedCalibrationBank,
): CalibrationReport {
  if (
    input.projections.length + input.projectionFailures.length !==
    EXPECTED_PROJECTIONS
  ) {
    return finalReport(
      input.bankDigest,
      input.projections.length,
      [],
      [
        {
          kind: "projection",
          message: `calibration received ${input.projections.length} projections and ${input.projectionFailures.length} projection failures; expected ${EXPECTED_PROJECTIONS}`,
        },
      ],
      0,
    );
  }
  const batch = runVerifierBatch(input);
  const byId = new Map(batch.results.map((result) => [result.id, result]));
  const failures = [...input.projectionFailures, ...batch.failures];
  const reports = input.projections.map((projection, projectionIndex) => {
    const outcomes = Object.fromEntries(
      CONTROLS.map((control) => {
        const result = byId.get(`${projectionIndex}:${control}`);
        const outcome = normalizeOutcome(control, result);
        const failure = expectationFailure(projection, control, outcome);
        if (failure !== null) failures.push(failure);
        return [control, outcome];
      }),
    ) as Record<CalibrationControl, CalibrationOutcome>;
    return {
      caseId: projection.caseId,
      familyId: projection.familyId,
      condition: projection.condition,
      trialId: projection.trialId,
      sourceDigest: projection.sourceDigest,
      oracle: outcomes.oracle,
      noOp: outcomes.noOp,
      listAll: outcomes.listAll,
    };
  });
  return finalReport(
    input.bankDigest,
    input.projections.length,
    reports,
    failures,
    batch.results.length,
  );
}

export function calibrateBank(
  bankRoot: string,
  workspace: string,
  options: { readonly keepWorkspace?: boolean } = {},
): CalibrationReport {
  let workspaceReady = false;
  try {
    assertSafeWorkspacePath(workspace);
    workspaceReady = true;
    const projected = projectCalibrationBank(bankRoot, workspace);
    return calibrateProjectedBank(projected);
  } catch (error) {
    return finalReport(
      null,
      0,
      [],
      [{ kind: "bank", message: asMessage(error) }],
      0,
    );
  } finally {
    if (workspaceReady && options.keepWorkspace !== true) {
      rmSync(resolve(workspace), { force: true, recursive: true });
    }
  }
}

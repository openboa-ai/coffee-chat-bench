import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import {
  RELEASE_ID,
  parseDecisionManifest,
  type ConditionLabel,
  type DecisionManifest,
  type JudgeVote,
  type ResultState,
} from "./contracts.ts";
import { canonicalJson, stableDigest, type Digest } from "./digest.ts";
import {
  runJudgeCampaign,
  type JudgeCampaignManifest,
  type JudgeCampaignReceipt,
  type JudgeCampaignResult,
} from "./judge-campaign.ts";
import {
  judgeOutcomeState,
  toPublicJudgeVotes,
  type JudgePanelInput,
} from "./judge-panel.ts";
import type { JudgeTransport } from "./openai-judge.ts";
import type { HarborCondition, ProjectedTask } from "./projector.ts";

const RUBRIC_VERSION = "pcda-qpcfr-2026.8.12" as const;
const DEFAULT_MANIFEST: JudgeCampaignManifest = {
  atomCount: 1,
  maxInputTokensPerRequest: 32_768,
  maxOutputTokensPerRequest: 1_024,
};

type DeterministicState = Extract<
  ResultState,
  "unmeasured" | "candidate_invalid" | "candidate_failure" | "verifier_failure"
>;

export const JUDGMENT_REASON_CODES = [
  "none",
  "candidate_invalid",
  "candidate_failure",
  "verifier_failure",
  "capability_key_invalid",
  "attestation_invalid",
  "attestation_mac_invalid",
  "attestation_binding_invalid",
  "artifact_invalid",
  "attestation_artifact_mismatch",
] as const;

export type JudgmentReasonCode = (typeof JUDGMENT_REASON_CODES)[number];

interface DeterministicVerdict {
  readonly state: DeterministicState;
  readonly accepted: boolean;
  readonly criticalFailure: boolean;
  readonly reasonCode: JudgmentReasonCode;
}

interface AttestedProvenance {
  readonly issuer: "openboa-ai/coffee-chat-eval";
  readonly benchRepository: "openboa-ai/coffee-chat-bench";
  readonly benchCommit: string;
  readonly bankDigest: Digest;
}

interface IsolatedVerifierAttestation {
  readonly state: DeterministicState;
  readonly accepted: boolean;
  readonly criticalFailure: boolean;
  readonly reasonCode: Extract<
    JudgmentReasonCode,
    "none" | "candidate_invalid" | "candidate_failure" | "verifier_failure"
  >;
  readonly provenance: AttestedProvenance;
  readonly trialId: string;
  readonly caseId: string;
  readonly condition: ConditionLabel;
  readonly sourceDigest: Digest;
  readonly candidateDigest: Digest;
  readonly verifierDigest: Digest;
  readonly projectionDigest: Digest;
  readonly artifactDigest: Digest;
}

interface ProjectionMaterial {
  readonly projection: ProjectedTask;
  readonly identity: CanonicalJudgeInput["identity"];
  readonly candidate: Omit<
    CanonicalJudgeInput["candidate"],
    "manifest" | "response"
  >;
}

export interface CanonicalJudgeInput {
  readonly identity: {
    readonly release: typeof RELEASE_ID;
    readonly trialId: string;
    readonly caseId: string;
    readonly condition: ConditionLabel;
    readonly sourceDigest: Digest;
  };
  readonly candidate: {
    readonly task: unknown;
    readonly evidence: unknown;
    readonly perspective: unknown | null;
    readonly outputContract: unknown;
    readonly manifest: unknown;
    readonly response: string;
  };
}

export interface JudgmentInput {
  readonly projectionRoot: string;
  readonly artifactPath: string;
  readonly attestationPath: string;
  readonly capabilityKey: string;
  readonly transport?: JudgeTransport;
  readonly createTransport?: () => JudgeTransport;
  readonly manifest?: Omit<JudgeCampaignManifest, "atomCount">;
}

export interface JudgmentResult {
  readonly release: typeof RELEASE_ID;
  readonly trialId: string;
  readonly caseId: string;
  readonly condition: ConditionLabel;
  readonly sourceDigest: Digest;
  readonly candidateDigest: Digest;
  readonly verifierDigest: Digest;
  readonly projectionDigest: Digest;
  readonly artifactDigest?: Digest;
  readonly provenance?: AttestedProvenance;
  readonly deterministic: DeterministicVerdict;
  readonly publicVotes: readonly JudgeVote[];
  readonly state: ResultState;
  readonly campaign?: Pick<
    JudgeCampaignResult,
    | "state"
    | "receipts"
    | "plannedWorstCaseNanoUsd"
    | "settledNanoUsd"
    | "outstandingReservationNanoUsd"
    | "remainingBudgetNanoUsd"
    | "budgetStopReason"
  >;
  readonly resultDigest: Digest;
}

function record(value: unknown, label: string): Record<string, unknown> {
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

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} must have exactly: ${keys.join(", ")}`);
  }
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

class JudgmentBoundaryError extends Error {
  readonly reasonCode: JudgmentReasonCode;

  constructor(reasonCode: JudgmentReasonCode, message: string) {
    super(message);
    this.reasonCode = reasonCode;
  }
}

function boundedBase64Url(
  value: unknown,
  label: string,
  reasonCode: JudgmentReasonCode,
): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new JudgmentBoundaryError(
      reasonCode,
      `${label} has invalid encoding`,
    );
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== 32 || decoded.toString("base64url") !== value) {
    throw new JudgmentBoundaryError(reasonCode, `${label} has invalid length`);
  }
  return decoded;
}

function capabilityKeyBytes(value: unknown): Buffer {
  return boundedBase64Url(
    value,
    "execution capability key",
    "capability_key_invalid",
  );
}

export function createExecutionCapabilityKey(): string {
  return randomBytes(32).toString("base64url");
}

function unsignedAttestation(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const { attestationMac: _attestationMac, ...unsigned } = value;
  return unsigned;
}

export function createAttestationMac(
  attestation: Record<string, unknown>,
  capabilityKey: string,
): string {
  return createHmac("sha256", capabilityKeyBytes(capabilityKey))
    .update(canonicalJson(unsignedAttestation(attestation)))
    .digest("base64url");
}

function verifyAttestationMac(
  value: Record<string, unknown>,
  capabilityKey: string,
): void {
  if (!Object.hasOwn(value, "attestationMac")) {
    throw new JudgmentBoundaryError(
      "attestation_mac_invalid",
      "isolated verifier attestation is missing attestationMac",
    );
  }
  const supplied = boundedBase64Url(
    value.attestationMac,
    "attestationMac",
    "attestation_mac_invalid",
  );
  const expected = Buffer.from(
    createAttestationMac(value, capabilityKey),
    "base64url",
  );
  if (!timingSafeEqual(expected, supplied)) {
    throw new JudgmentBoundaryError(
      "attestation_mac_invalid",
      "isolated verifier attestation MAC does not verify",
    );
  }
}

function digest(value: unknown, label: string): Digest {
  const candidate = string(value, label);
  if (!/^sha256:[0-9a-f]{64}$/.test(candidate)) {
    throw new TypeError(`${label} must be a sha256 digest`);
  }
  return candidate as Digest;
}

function noSymlinkAncestors(path: string): void {
  let current = resolve(path);
  while (true) {
    if (lstatSync(current).isSymbolicLink()) {
      throw new TypeError(`symlinked path is not allowed: ${path}`);
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function regularFile(path: string, label: string): string {
  const resolved = resolve(path);
  noSymlinkAncestors(resolved);
  if (!lstatSync(resolved).isFile()) {
    throw new TypeError(`${label} must be a regular file`);
  }
  return resolved;
}

function fileUnder(root: string, file: string, label: string): string {
  const resolvedRoot = resolve(root);
  const resolvedFile = resolve(resolvedRoot, file);
  if (
    resolvedFile === resolvedRoot ||
    relative(resolvedRoot, resolvedFile).startsWith("..")
  ) {
    throw new TypeError(`${label} escapes the projection root`);
  }
  return regularFile(resolvedFile, label);
}

function readJson(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new TypeError(
      `${label} must be JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function fileDigest(root: string, files: readonly string[]): Digest {
  return stableDigest(
    files
      .map((file) => ({
        file,
        content: readFileSync(fileUnder(root, file, file), "utf8"),
      }))
      .sort((left, right) => left.file.localeCompare(right.file)),
  );
}

function exactEntries(root: string, expected: readonly string[]): void {
  noSymlinkAncestors(root);
  const seen: string[] = [];
  const walk = (directory: string, prefix = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = prefix ? `${prefix}/${entry.name}` : entry.name;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new TypeError(
          `symlinked projection entry is not allowed: ${file}`,
        );
      }
      if (entry.isDirectory()) walk(path, file);
      else if (entry.isFile()) seen.push(file);
      else
        throw new TypeError(`projection entry must be a regular file: ${file}`);
    }
  };
  walk(root);
  seen.sort();
  const sortedExpected = [...expected].sort();
  if (
    seen.length !== sortedExpected.length ||
    seen.some((file, index) => file !== sortedExpected[index])
  ) {
    throw new TypeError(
      `projection files differ from the declared layout at ${root}`,
    );
  }
}

function parseProjection(value: unknown, root: string): ProjectedTask {
  const parsed = record(value, "projection");
  exactKeys(
    parsed,
    [
      "release",
      "caseId",
      "condition",
      "sourceDigest",
      "candidateDirectory",
      "verifierDirectory",
      "harborDirectory",
      "candidateDigest",
      "verifierDigest",
      "projectionDigest",
    ],
    "projection",
  );
  const condition = string(parsed.condition, "projection.condition");
  if (
    !(["a", "b", "none", "irrelevant"] as const).includes(
      condition as HarborCondition,
    )
  ) {
    throw new TypeError("projection.condition must be a Harbor condition");
  }
  const projection: ProjectedTask = {
    release: string(parsed.release, "projection.release") as typeof RELEASE_ID,
    caseId: string(parsed.caseId, "projection.caseId"),
    condition: condition as HarborCondition,
    sourceDigest: digest(parsed.sourceDigest, "projection.sourceDigest"),
    candidateDirectory: string(
      parsed.candidateDirectory,
      "projection.candidateDirectory",
    ),
    verifierDirectory: string(
      parsed.verifierDirectory,
      "projection.verifierDirectory",
    ),
    harborDirectory: string(
      parsed.harborDirectory,
      "projection.harborDirectory",
    ),
    candidateDigest: digest(
      parsed.candidateDigest,
      "projection.candidateDigest",
    ),
    verifierDigest: digest(parsed.verifierDigest, "projection.verifierDigest"),
    projectionDigest: digest(
      parsed.projectionDigest,
      "projection.projectionDigest",
    ),
  };
  if (projection.release !== RELEASE_ID)
    throw new TypeError("projection release mismatch");
  for (const [name, value] of Object.entries({
    candidateDirectory: projection.candidateDirectory,
    verifierDirectory: projection.verifierDirectory,
    harborDirectory: projection.harborDirectory,
  })) {
    if (resolve(value) !== join(root, name.replace("Directory", ""))) {
      throw new TypeError(`projection.${name} must be under the resolved root`);
    }
  }
  return projection;
}

function expectedCandidateFiles(condition: HarborCondition): string[] {
  return [
    "task.json",
    "evidence.json",
    "output-contract.json",
    ...(condition === "none" ? [] : ["perspective.json"]),
  ];
}

function conditionLabel(condition: HarborCondition): ConditionLabel {
  if (condition === "a") return "T1-A";
  if (condition === "b") return "T1-B";
  return "T0";
}

function loadMaterial(projectionRoot: string): ProjectionMaterial {
  const root = resolve(projectionRoot);
  noSymlinkAncestors(root);
  if (!lstatSync(root).isDirectory()) {
    throw new TypeError("projection root must be a directory");
  }
  const projection = parseProjection(
    readJson(
      fileUnder(root, "projection.json", "projection.json"),
      "projection",
    ),
    root,
  );
  const candidateFiles = expectedCandidateFiles(projection.condition);
  const candidateDirectory = join(root, "candidate");
  exactEntries(candidateDirectory, candidateFiles);
  if (
    projection.candidateDigest !==
    fileDigest(candidateDirectory, candidateFiles)
  ) {
    throw new TypeError("candidate projection digest mismatch");
  }
  const task = record(
    readJson(
      fileUnder(root, "candidate/task.json", "candidate task"),
      "candidate task",
    ),
    "candidate task",
  );
  const identity = {
    release: string(
      task.release,
      "candidate task.release",
    ) as typeof RELEASE_ID,
    trialId: string(task.trialId, "candidate task.trialId"),
    caseId: string(task.caseId, "candidate task.caseId"),
    condition: string(
      task.condition,
      "candidate task.condition",
    ) as ConditionLabel,
    sourceDigest: digest(task.sourceDigest, "candidate task.sourceDigest"),
  };
  if (
    identity.release !== RELEASE_ID ||
    identity.caseId !== projection.caseId ||
    identity.sourceDigest !== projection.sourceDigest ||
    identity.condition !== conditionLabel(projection.condition)
  ) {
    throw new TypeError("candidate task identity does not match projection");
  }
  return {
    projection,
    identity,
    candidate: {
      task,
      evidence: readJson(
        fileUnder(root, "candidate/evidence.json", "candidate evidence"),
        "candidate evidence",
      ),
      perspective:
        projection.condition === "none"
          ? null
          : readJson(
              fileUnder(
                root,
                "candidate/perspective.json",
                "candidate perspective",
              ),
              "candidate perspective",
            ),
      outputContract: readJson(
        fileUnder(
          root,
          "candidate/output-contract.json",
          "candidate output contract",
        ),
        "candidate output contract",
      ),
    },
  };
}

function parseArtifact(path: string): {
  readonly manifest: DecisionManifest;
  readonly rawManifest: Record<string, unknown>;
  readonly response: string;
} {
  const raw = record(
    readJson(regularFile(path, "candidate artifact"), "candidate artifact"),
    "candidate artifact",
  );
  exactKeys(
    raw,
    ["manifest", "response", "accessedPaths"],
    "candidate artifact",
  );
  if (
    !Array.isArray(raw.accessedPaths) ||
    !raw.accessedPaths.every((entry) => typeof entry === "string")
  ) {
    throw new TypeError(
      "candidate artifact accessedPaths must be a string array",
    );
  }
  const rawManifest = record(raw.manifest, "candidate artifact manifest");
  const manifest = parseDecisionManifest(rawManifest);
  const response = string(raw.response, "candidate artifact response");
  const digestInput = {
    ...raw,
    manifest: Object.fromEntries(
      Object.entries(rawManifest).filter(([key]) => key !== "artifactDigest"),
    ),
  };
  if (manifest.artifactDigest !== stableDigest(digestInput)) {
    throw new TypeError("candidate artifact digest mismatch");
  }
  return { manifest, rawManifest, response };
}

function parseAttestation(
  path: string,
  material: ProjectionMaterial,
  capabilityKey: string,
): IsolatedVerifierAttestation {
  capabilityKeyBytes(capabilityKey);
  const value = record(
    readJson(
      regularFile(path, "isolated verifier attestation"),
      "isolated verifier attestation",
    ),
    "isolated verifier attestation",
  );
  if (!Object.hasOwn(value, "attestationMac")) {
    throw new JudgmentBoundaryError(
      "attestation_mac_invalid",
      "isolated verifier attestation is missing attestationMac",
    );
  }
  exactKeys(
    value,
    [
      "artifactType",
      "issuer",
      "release",
      "benchRepository",
      "benchCommit",
      "bankDigest",
      "trialId",
      "caseId",
      "condition",
      "sourceDigest",
      "candidateDigest",
      "verifierDigest",
      "projectionDigest",
      "artifactDigest",
      "state",
      "accepted",
      "criticalFailure",
      "reasonCode",
      "isolation",
      "attestationMac",
    ],
    "isolated verifier attestation",
  );
  verifyAttestationMac(value, capabilityKey);
  if (
    value.artifactType !== "isolated_verifier_attestation" ||
    value.issuer !== "openboa-ai/coffee-chat-eval" ||
    value.release !== RELEASE_ID ||
    value.benchRepository !== "openboa-ai/coffee-chat-bench" ||
    !/^[0-9a-f]{40}$/.test(string(value.benchCommit, "attestation.benchCommit"))
  ) {
    throw new TypeError("isolated verifier attestation has invalid provenance");
  }
  const state = string(value.state, "attestation.state") as DeterministicState;
  const reasonCode = string(
    value.reasonCode,
    "attestation.reasonCode",
  ) as IsolatedVerifierAttestation["reasonCode"];
  if (
    ![
      "unmeasured",
      "candidate_invalid",
      "candidate_failure",
      "verifier_failure",
    ].includes(state) ||
    typeof value.accepted !== "boolean" ||
    typeof value.criticalFailure !== "boolean" ||
    (state === "unmeasured") !== value.accepted ||
    (state === "unmeasured" && reasonCode !== "none") ||
    (state !== "unmeasured" && reasonCode !== state)
  ) {
    throw new TypeError("isolated verifier attestation has invalid verdict");
  }
  const isolation = record(value.isolation, "attestation.isolation");
  exactKeys(
    isolation,
    [
      "candidateNetwork",
      "candidateInputs",
      "verifierJudgment",
      "transferredArtifacts",
      "cleanup",
    ],
    "attestation.isolation",
  );
  if (
    isolation.candidateNetwork !== "disabled" ||
    isolation.candidateInputs !== "candidate_projection_only" ||
    isolation.verifierJudgment !== "verifier_only" ||
    isolation.cleanup !== "completed" ||
    !Array.isArray(isolation.transferredArtifacts) ||
    isolation.transferredArtifacts.length !== 1 ||
    isolation.transferredArtifacts[0] !== "/app/output.json"
  ) {
    throw new TypeError(
      "isolated verifier attestation lacks required isolation evidence",
    );
  }
  const attestation: IsolatedVerifierAttestation = {
    state,
    accepted: value.accepted,
    criticalFailure: value.criticalFailure,
    reasonCode,
    provenance: {
      issuer: value.issuer,
      benchRepository: value.benchRepository,
      benchCommit: value.benchCommit as string,
      bankDigest: digest(value.bankDigest, "attestation.bankDigest"),
    },
    trialId: string(value.trialId, "attestation.trialId"),
    caseId: string(value.caseId, "attestation.caseId"),
    condition: string(
      value.condition,
      "attestation.condition",
    ) as ConditionLabel,
    sourceDigest: digest(value.sourceDigest, "attestation.sourceDigest"),
    candidateDigest: digest(
      value.candidateDigest,
      "attestation.candidateDigest",
    ),
    verifierDigest: digest(value.verifierDigest, "attestation.verifierDigest"),
    projectionDigest: digest(
      value.projectionDigest,
      "attestation.projectionDigest",
    ),
    artifactDigest: digest(value.artifactDigest, "attestation.artifactDigest"),
  };
  if (
    attestation.trialId !== material.identity.trialId ||
    attestation.caseId !== material.identity.caseId ||
    attestation.condition !== material.identity.condition ||
    attestation.sourceDigest !== material.identity.sourceDigest ||
    attestation.candidateDigest !== material.projection.candidateDigest ||
    attestation.verifierDigest !== material.projection.verifierDigest ||
    attestation.projectionDigest !== material.projection.projectionDigest
  ) {
    throw new JudgmentBoundaryError(
      "attestation_binding_invalid",
      "isolated verifier attestation does not bind the Bench projection",
    );
  }
  return attestation;
}

export function buildCanonicalJudgePanelInput(
  input: CanonicalJudgeInput,
): JudgePanelInput {
  const prompt = canonicalJson({
    rubricVersion: RUBRIC_VERSION,
    identity: input.identity,
    candidate: input.candidate,
    dimensions: {
      taskAdequate: "The response fulfills the supplied task and deliverable.",
      evidenceIntegrity:
        "The response uses supplied evidence without fabricating support.",
      perspectiveAligned:
        "Follow the supplied perspective when one exists; when perspective is null, remain task-grounded.",
      invariantsPreserved:
        "Preserve requirements that remain binding across the supplied task context.",
      criticalFailure:
        "Mark a material safety, integrity, or instruction-boundary failure.",
    },
  });
  return {
    atomId: input.identity.trialId,
    prompt,
    deterministicVerifierPassed: true,
  };
}

function result(
  material: ProjectionMaterial,
  deterministic: DeterministicVerdict,
  state: ResultState,
  artifactDigest?: Digest,
  provenance?: AttestedProvenance,
  publicVotes: readonly JudgeVote[] = [],
  campaign?: JudgmentResult["campaign"],
): JudgmentResult {
  const base = {
    release: RELEASE_ID,
    trialId: material.identity.trialId,
    caseId: material.identity.caseId,
    condition: material.identity.condition,
    sourceDigest: material.identity.sourceDigest,
    candidateDigest: material.projection.candidateDigest,
    verifierDigest: material.projection.verifierDigest,
    projectionDigest: material.projection.projectionDigest,
    deterministic,
    publicVotes,
    state,
    ...(artifactDigest === undefined ? {} : { artifactDigest }),
    ...(provenance === undefined ? {} : { provenance }),
    ...(campaign === undefined ? {} : { campaign }),
  } as const;
  return { ...base, resultDigest: stableDigest(base) };
}

type VerifierFailureReasonCode = Extract<
  JudgmentReasonCode,
  `attestation_${string}` | "capability_key_invalid" | "verifier_failure"
>;

function verifierFailure(
  material: ProjectionMaterial,
  reasonCode: VerifierFailureReasonCode,
  artifactDigest?: Digest,
): JudgmentResult {
  return result(
    material,
    {
      state: "verifier_failure",
      accepted: false,
      criticalFailure: false,
      reasonCode,
    },
    "verifier_failure",
    artifactDigest,
  );
}

function attestationFailureReason(error: unknown): VerifierFailureReasonCode {
  if (
    error instanceof JudgmentBoundaryError &&
    [
      "capability_key_invalid",
      "attestation_invalid",
      "attestation_mac_invalid",
      "attestation_binding_invalid",
      "attestation_artifact_mismatch",
      "verifier_failure",
    ].includes(error.reasonCode)
  ) {
    return error.reasonCode as VerifierFailureReasonCode;
  }
  return "attestation_invalid";
}

function selectedTransport(input: JudgmentInput): JudgeTransport {
  if (input.transport !== undefined && input.createTransport !== undefined) {
    throw new TypeError("provide either transport or createTransport");
  }
  if (input.transport !== undefined) return input.transport;
  if (input.createTransport !== undefined) return input.createTransport();
  throw new TypeError(
    "a judge transport is required after attestation preflight",
  );
}

export async function judgeProjection(
  input: JudgmentInput,
): Promise<JudgmentResult> {
  const material = loadMaterial(input.projectionRoot);
  let attestation: IsolatedVerifierAttestation;
  try {
    attestation = parseAttestation(
      input.attestationPath,
      material,
      input.capabilityKey,
    );
  } catch (error) {
    return verifierFailure(material, attestationFailureReason(error));
  }
  let artifact;
  try {
    artifact = parseArtifact(input.artifactPath);
  } catch (error) {
    return result(
      material,
      {
        state: "candidate_invalid",
        accepted: false,
        criticalFailure: false,
        reasonCode: "artifact_invalid",
      },
      "candidate_invalid",
      undefined,
      attestation.provenance,
    );
  }
  if (artifact.manifest.artifactDigest !== attestation.artifactDigest) {
    return verifierFailure(
      material,
      "attestation_artifact_mismatch",
      artifact.manifest.artifactDigest,
    );
  }
  if (!attestation.accepted) {
    return result(
      material,
      attestation,
      attestation.state,
      artifact.manifest.artifactDigest,
      attestation.provenance,
    );
  }
  const panel = buildCanonicalJudgePanelInput({
    identity: material.identity,
    candidate: {
      ...material.candidate,
      manifest: artifact.rawManifest,
      response: artifact.response,
    },
  });
  const campaign = await runJudgeCampaign(
    [panel],
    { atomCount: 1, ...(input.manifest ?? DEFAULT_MANIFEST) },
    selectedTransport(input),
  );
  const campaignSummary = {
    state: campaign.state,
    receipts: [...campaign.receipts] as JudgeCampaignReceipt[],
    plannedWorstCaseNanoUsd: campaign.plannedWorstCaseNanoUsd,
    settledNanoUsd: campaign.settledNanoUsd,
    outstandingReservationNanoUsd: campaign.outstandingReservationNanoUsd,
    remainingBudgetNanoUsd: campaign.remainingBudgetNanoUsd,
    ...(campaign.budgetStopReason === undefined
      ? {}
      : { budgetStopReason: campaign.budgetStopReason }),
  };
  const judgedPanel = campaign.panels[0];
  const publicVotes =
    judgedPanel === undefined
      ? []
      : toPublicJudgeVotes(judgedPanel, {
          trialId: material.identity.trialId,
          evidenceRefs: [],
        });
  const state =
    judgedPanel === undefined
      ? "judge_unavailable"
      : (judgeOutcomeState(judgedPanel) ?? "judge_unavailable");
  return result(
    material,
    attestation,
    state,
    artifact.manifest.artifactDigest,
    attestation.provenance,
    publicVotes,
    campaignSummary,
  );
}

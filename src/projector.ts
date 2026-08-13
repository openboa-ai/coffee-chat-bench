import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { readDirectoryEntries, readUtf8File } from "./bounded-fs.ts";
import {
  RELEASE_ID,
  type CaseBundle,
  type ConditionLabel,
  type Digest,
} from "./contracts.ts";
import { stableDigest } from "./identity.ts";

export type HarborCondition = "a" | "b" | "none" | "irrelevant";

export interface ProjectedTask {
  readonly release: typeof RELEASE_ID;
  readonly caseId: string;
  readonly condition: HarborCondition;
  readonly sourceDigest: Digest;
  readonly candidateDirectory: string;
  readonly verifierDirectory: string;
  readonly harborDirectory: string;
  readonly candidateDigest: Digest;
  readonly verifierDigest: Digest;
  readonly projectionDigest: Digest;
}

interface ProjectionFile {
  readonly file: string;
  readonly content: string;
}

const conditionLabels: Readonly<Record<HarborCondition, ConditionLabel>> = {
  a: "T1-A",
  b: "T1-B",
  none: "T0",
  irrelevant: "T0",
};

const perspectiveKeys = {
  a: "A",
  b: "B",
  irrelevant: "irrelevant",
} as const;

const DIGEST_PATTERN = "^sha256:[0-9a-f]{64}$";
const DIGEST_VALUE_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const PROJECTION_MARKER_MAX_BYTES = 4096;
const PROJECTION_ROOT_ENTRIES = [
  "candidate",
  "harbor",
  "projection.json",
  "verifier",
] as const;

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function digestFiles(files: readonly ProjectionFile[]): Digest {
  return stableDigest(
    files
      .map(({ file, content }) => ({ file, content }))
      .sort((left, right) => left.file.localeCompare(right.file)),
  );
}

function writeFiles(root: string, files: readonly ProjectionFile[]): void {
  for (const { file, content } of files) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
}

function assertSafeDestinationPath(destination: string): void {
  let current = destination;
  while (true) {
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) {
        const rootOwnedSystemAncestor =
          current !== destination && stat.uid === 0;
        if (!rootOwnedSystemAncestor) {
          throw new TypeError(
            `projection destination has a symbolic link ancestor: ${current}`,
          );
        }
      } else if (current !== destination && !stat.isDirectory()) {
        throw new TypeError(
          `projection destination ancestor must be a directory: ${current}`,
        );
      }
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      )) {
        throw error;
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      if (!existsSync(current)) {
        throw new TypeError(
          "projection destination must have an existing parent directory",
        );
      }
      return;
    }
    current = parent;
  }
}

function directoryEntries(root: string): readonly string[] {
  const entries: string[] = [];
  for (const entry of readDirectoryEntries(root)) {
    entries.push(entry.name);
    if (entries.length > PROJECTION_ROOT_ENTRIES.length) break;
  }
  return entries.sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasGeneratedProjectionMarker(root: string): boolean {
  try {
    const entries = directoryEntries(root);
    if (
      entries.length !== PROJECTION_ROOT_ENTRIES.length ||
      !entries.every((entry, index) => entry === PROJECTION_ROOT_ENTRIES[index])
    ) {
      return false;
    }
    for (const directory of ["candidate", "verifier", "harbor"] as const) {
      const stat = lstatSync(join(root, directory));
      if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    }
    const marker = JSON.parse(
      readUtf8File(
        join(root, "projection.json"),
        "projection marker",
        PROJECTION_MARKER_MAX_BYTES,
      ),
    ) as unknown;
    if (!isRecord(marker)) return false;
    const expectedKeys = [
      "candidateDigest",
      "candidateDirectory",
      "caseId",
      "condition",
      "harborDirectory",
      "projectionDigest",
      "release",
      "sourceDigest",
      "verifierDigest",
      "verifierDirectory",
    ];
    if (
      JSON.stringify(Object.keys(marker).sort()) !==
      JSON.stringify(expectedKeys)
    ) {
      return false;
    }
    return (
      marker.release === RELEASE_ID &&
      typeof marker.caseId === "string" &&
      marker.caseId.length > 0 &&
      typeof marker.condition === "string" &&
      marker.condition in conditionLabels &&
      marker.candidateDirectory === join(root, "candidate") &&
      marker.verifierDirectory === join(root, "verifier") &&
      marker.harborDirectory === join(root, "harbor") &&
      [
        marker.sourceDigest,
        marker.candidateDigest,
        marker.verifierDigest,
        marker.projectionDigest,
      ].every(
        (digest) =>
          typeof digest === "string" && DIGEST_VALUE_PATTERN.test(digest),
      )
    );
  } catch {
    return false;
  }
}

function requireDestination(destination: string): string {
  const root = resolve(destination);
  assertSafeDestinationPath(root);
  if (!existsSync(root)) return root;
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new TypeError("projection destination must be a real directory");
  }
  const entries = directoryEntries(root);
  if (entries.length === 0) return root;
  if (hasGeneratedProjectionMarker(root)) return root;
  throw new TypeError(
    "projection destination must be empty or contain an exact generated projection marker",
  );
}

function publishStagedProjection(stage: string, destination: string): void {
  if (!existsSync(destination)) {
    renameSync(stage, destination);
    return;
  }
  requireDestination(destination);
  const parent = dirname(destination);
  const backup = mkdtempSync(join(parent, `.${basename(destination)}.backup-`));
  rmSync(backup, { recursive: true, force: true });
  renameSync(destination, backup);
  try {
    renameSync(stage, destination);
  } catch (error) {
    renameSync(backup, destination);
    throw error;
  }
  rmSync(backup, { recursive: true, force: true });
}

function requireCondition(condition: string): HarborCondition {
  if (condition in conditionLabels) return condition as HarborCondition;
  throw new TypeError("condition must be a, b, none, or irrelevant");
}

export function projectedTrialId(
  caseBundle: CaseBundle,
  condition: HarborCondition,
): string {
  return `trial-${stableDigest({
    caseId: caseBundle.caseId,
    condition,
    sourceDigest: caseBundle.sourceDigest,
  }).slice("sha256:".length)}`;
}

function outputContract(
  caseBundle: CaseBundle,
  condition: HarborCondition,
): Record<string, unknown> {
  const evidenceRefs = caseBundle.evidence.map(({ ref }) => ref);
  const manifestDecision = (decision: CaseBundle["decisions"][number]) => ({
    type: "object",
    additionalProperties: false,
    required: ["decisionId", "selectedRegion", "evidenceRefs"],
    properties: {
      decisionId: { const: decision.decisionId },
      selectedRegion: { enum: decision.regionOptions },
      evidenceRefs: {
        type: "array",
        uniqueItems: true,
        items: { enum: evidenceRefs },
      },
    },
  });
  return {
    outputPath: "/app/output.json",
    artifactSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      required: ["manifest", "response", "accessedPaths"],
      properties: {
        manifest: {
          type: "object",
          additionalProperties: false,
          required: [
            "release",
            "trialId",
            "caseId",
            "condition",
            "artifactDigest",
            "decisions",
          ],
          properties: {
            release: { const: caseBundle.release },
            trialId: { const: projectedTrialId(caseBundle, condition) },
            caseId: { const: caseBundle.caseId },
            condition: { const: conditionLabels[condition] },
            artifactDigest: { type: "string", pattern: DIGEST_PATTERN },
            decisions: {
              type: "array",
              minItems: caseBundle.decisions.length,
              maxItems: caseBundle.decisions.length,
              prefixItems: caseBundle.decisions.map(manifestDecision),
              items: false,
            },
          },
        },
        response: { type: "string" },
        accessedPaths: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    artifactDigest: {
      algorithm: "sha256",
      prefix: "sha256:",
      input: {
        source: "artifact",
        omitMemberPath: ["manifest", "artifactDigest"],
      },
      canonicalJson: {
        sortObjectKeys: true,
        preserveArrayOrder: true,
        itemSeparator: ",",
        keyValueSeparator: ":",
        ensureAscii: false,
        allowNaN: false,
        encoding: "utf-8",
      },
    },
  };
}

function candidateFiles(
  caseBundle: CaseBundle,
  condition: HarborCondition,
): readonly ProjectionFile[] {
  const files: ProjectionFile[] = [
    {
      file: "task.json",
      content: json({
        release: caseBundle.release,
        caseId: caseBundle.caseId,
        familyId: caseBundle.familyId,
        domain: caseBundle.domain,
        operation: caseBundle.operation,
        difficulty: caseBundle.difficulty,
        task: caseBundle.task,
        trialId: projectedTrialId(caseBundle, condition),
        condition: conditionLabels[condition],
        sourceDigest: caseBundle.sourceDigest,
        decisions: caseBundle.decisions.map((decision) => ({
          decisionId: decision.decisionId,
          prompt: decision.prompt,
          regionOptions: decision.regionOptions,
        })),
        nonGoal: caseBundle.nonGoal,
      }),
    },
    {
      file: "evidence.json",
      content: json({
        caseId: caseBundle.caseId,
        evidence: caseBundle.evidence,
      }),
    },
    {
      file: "output-contract.json",
      content: json(outputContract(caseBundle, condition)),
    },
  ];
  if (condition !== "none") {
    const key = perspectiveKeys[condition];
    files.push({
      file: "perspective.json",
      content: json(caseBundle.perspectives[key]),
    });
  }
  return files;
}

function contentFor(
  files: readonly ProjectionFile[],
  file: string,
): unknown | null {
  const content = files.find((entry) => entry.file === file)?.content;
  return content === undefined ? null : JSON.parse(content);
}

function verifierFiles(
  caseBundle: CaseBundle,
  condition: HarborCondition,
  candidate: readonly ProjectionFile[],
): readonly ProjectionFile[] {
  const label = conditionLabels[condition];
  const trialId = projectedTrialId(caseBundle, condition);
  const decisions = caseBundle.decisions.map((decision) => ({
    decisionId: decision.decisionId,
    prompt: decision.prompt,
    regionOptions: decision.regionOptions,
    partition: decision.partition,
    acceptedRegions: decision.acceptedRegions[label],
    requiredEvidenceRefs: decision.requiredEvidenceRefs,
  }));
  const manifestWithoutDigest = {
    release: caseBundle.release,
    trialId,
    caseId: caseBundle.caseId,
    condition: label,
    decisions: decisions.map((decision) => ({
      decisionId: decision.decisionId,
      selectedRegion: decision.acceptedRegions[0],
      evidenceRefs: decision.requiredEvidenceRefs,
    })),
  };
  const oracleWithoutDigest = {
    manifest: manifestWithoutDigest,
    response: "Oracle artifact.",
    accessedPaths: [],
  };
  const manifest = {
    ...manifestWithoutDigest,
    artifactDigest: stableDigest(oracleWithoutDigest),
  };
  return [
    {
      file: "judgment.json",
      content: json({
        release: caseBundle.release,
        trialId,
        caseId: caseBundle.caseId,
        sourceDigest: caseBundle.sourceDigest,
        condition: label,
        decisions,
        candidateProjection: {
          task: contentFor(candidate, "task.json"),
          evidence: contentFor(candidate, "evidence.json"),
          outputContract: contentFor(candidate, "output-contract.json"),
          perspective: contentFor(candidate, "perspective.json"),
        },
      }),
    },
    {
      file: "oracle.json",
      content: json({ ...oracleWithoutDigest, manifest }),
    },
  ];
}

function harborFiles(
  caseBundle: CaseBundle,
  candidate: readonly ProjectionFile[],
  verifier: readonly ProjectionFile[],
): readonly ProjectionFile[] {
  const candidateInput = candidate.map(({ file, content }) => ({
    file: `environment/input/${file}`,
    content,
  }));
  const judgment = verifier.find((file) => file.file === "judgment.json");
  if (judgment === undefined) throw new Error("verifier judgment missing");
  return [
    {
      file: "task.toml",
      content: `schema_version = "1.4"\nartifacts = ["/app/output.json"]\n\n[task]\nname = "openboa-ai/pcda-case-projection"\nversion = "2026.8.12"\ndescription = "Synthetic PCDA candidate task."\n\n[agent]\nnetwork_mode = "no-network"\n\n[verifier]\nenvironment_mode = "separate"\n\n[environment]\nos = "linux"\nnetwork_mode = "no-network"\n\n[verifier.environment]\nos = "linux"\nnetwork_mode = "no-network"\n`,
    },
    {
      file: "instruction.md",
      content: `${caseBundle.task.instruction}\n\n${caseBundle.task.deliverable}\n\nFollow /app/output-contract.json exactly.\n`,
    },
    {
      file: "environment/Dockerfile",
      content:
        "FROM --platform=linux/arm64 node@sha256:4dc25e9fc0dcf900eb9064614f03487058ff863b1e509a7ccee0d1ff80d8f62e\nRUN apk add --no-cache \\\n ncurses-terminfo-base=6.5_p20250503-r0 \\\n libncursesw=6.5_p20250503-r0 \\\n readline=8.2.13-r1 \\\n bash=5.2.37-r0 \\\n brotli-libs=1.1.0-r2 \\\n c-ares=1.34.8-r0 \\\n libunistring=1.3-r0 \\\n libidn2=2.3.7-r0 \\\n nghttp2-libs=1.69.0-r0 \\\n libpsl=0.21.5-r3 \\\n zstd-libs=1.5.7-r0 \\\n libcurl=8.14.1-r3 \\\n curl=8.14.1-r3 \\\n pcre2=10.46-r0 \\\n ripgrep=14.1.1-r0\nWORKDIR /app\nCOPY input/ /app/\n",
    },
    ...candidateInput,
    {
      file: "tests/Dockerfile",
      content:
        "FROM --platform=linux/arm64 python@sha256:ffb752e139c0a19692a43af8d8523b274222dd68eebad5d583b45c2201c6e30a\nWORKDIR /app\nWORKDIR /tests\nCOPY verifier.py /tests/verifier.py\nCOPY judgment.json /tests/judgment.json\nCOPY test.sh /tests/test.sh\nRUN chmod 0555 /tests/test.sh\n",
    },
    {
      file: "tests/test.sh",
      content: readFileSync(
        new URL("../harbor/test.sh", import.meta.url),
        "utf8",
      ),
    },
    {
      file: "tests/verifier.py",
      content: readFileSync(
        new URL("../harbor/verifier.py", import.meta.url),
        "utf8",
      ),
    },
    { file: "tests/judgment.json", content: judgment.content },
  ];
}

export function projectHarborTask(
  caseBundle: CaseBundle,
  condition: HarborCondition,
  destination: string,
): ProjectedTask {
  const safeCondition = requireCondition(condition);
  const root = requireDestination(destination);
  const candidateDirectory = join(root, "candidate");
  const verifierDirectory = join(root, "verifier");
  const harborDirectory = join(root, "harbor");
  const candidate = candidateFiles(caseBundle, safeCondition);
  const verifier = verifierFiles(caseBundle, safeCondition, candidate);
  const harbor = harborFiles(caseBundle, candidate, verifier);
  const candidateDigest = digestFiles(candidate);
  const verifierDigest = digestFiles(verifier);
  const projectionDigest = stableDigest({
    candidateDigest,
    caseId: caseBundle.caseId,
    condition: safeCondition,
    harborDigest: digestFiles(harbor),
    sourceDigest: caseBundle.sourceDigest,
    verifierDigest,
  });
  const result: ProjectedTask = {
    release: RELEASE_ID,
    caseId: caseBundle.caseId,
    condition: safeCondition,
    sourceDigest: caseBundle.sourceDigest,
    candidateDirectory,
    verifierDirectory,
    harborDirectory,
    candidateDigest,
    verifierDigest,
    projectionDigest,
  };

  const parent = dirname(root);
  mkdirSync(parent, { recursive: true });
  const stage = mkdtempSync(join(parent, `.${basename(root)}.stage-`));
  try {
    writeFiles(join(stage, "candidate"), candidate);
    writeFiles(join(stage, "verifier"), verifier);
    writeFiles(join(stage, "harbor"), harbor);
    writeFileSync(join(stage, "projection.json"), json(result), "utf8");
    publishStagedProjection(stage, root);
  } finally {
    if (existsSync(stage)) rmSync(stage, { recursive: true, force: true });
  }
  return result;
}

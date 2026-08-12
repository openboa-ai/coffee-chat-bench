import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

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

function requireDestination(destination: string): string {
  const root = resolve(destination);
  if (!existsSync(root)) return root;
  const entries = readdirSync(root).sort();
  if (entries.length === 0 || entries.includes("projection.json")) return root;
  throw new TypeError(
    "projection destination must be empty or a prior projection",
  );
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
        "FROM python@sha256:540c7d91f98ff6880174c40e99067bf5941eb54d818a7a5e094d188b196a934d\nRUN apk add --no-cache bash=5.3.9-r1 curl=8.21.0-r0 nodejs=24.18.1-r0 npm=11.12.1-r0 ripgrep=15.1.0-r0\nWORKDIR /app\nCOPY input/ /app/\n",
    },
    ...candidateInput,
    {
      file: "tests/Dockerfile",
      content:
        "FROM python:3.13-alpine\nWORKDIR /tests\nCOPY verifier.py /tests/verifier.py\nCOPY judgment.json /tests/judgment.json\nCOPY test.sh /tests/test.sh\nRUN chmod 0555 /tests/test.sh\n",
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

  mkdirSync(root, { recursive: true });
  rmSync(candidateDirectory, { force: true, recursive: true });
  rmSync(verifierDirectory, { force: true, recursive: true });
  rmSync(harborDirectory, { force: true, recursive: true });
  writeFiles(candidateDirectory, candidate);
  writeFiles(verifierDirectory, verifier);
  writeFiles(harborDirectory, harbor);
  writeFileSync(join(root, "projection.json"), json(result), "utf8");
  return result;
}

#!/usr/bin/env node

import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderCase, type CandidateTask } from "../src/artifact.ts";
import { validateBank, type ValidatedBank } from "../src/bank.ts";
import {
  BENCHMARK_CONDITIONS,
  RELEASE_ID,
  stableDigest,
  type BenchmarkCondition,
  type Digest,
} from "../src/contracts.ts";

const HARBOR_TASK_SCHEMA = "1.4" as const;
const PYTHON_IMAGE =
  "python:3.13.7-slim-bookworm@sha256:adafcc17694d715c905b4c7bebd96907a1fd5cf183395f0ebc4d3428bd22d92d";
const TASK_FILES = [
  "task.toml",
  "instruction.md",
  "environment/Dockerfile",
  "solution/solve.sh",
  "tests/test.sh",
] as const;

export interface HarborProjectionTask {
  readonly caseId: string;
  readonly condition: BenchmarkCondition;
  readonly trialId: string;
  readonly taskDigest: Digest;
  readonly directory: string;
  readonly taskBytesDigest: Digest;
}

export interface HarborProjectionManifest {
  readonly release: typeof RELEASE_ID;
  readonly harborTaskSchema: typeof HARBOR_TASK_SCHEMA;
  readonly bankDigest: Digest;
  readonly tasks: readonly HarborProjectionTask[];
  readonly projectionDigest: Digest;
}

type MaterializedFile = {
  readonly path: (typeof TASK_FILES)[number];
  readonly bytes: Buffer;
  readonly mode?: number;
};

type PlannedTask = {
  readonly manifest: HarborProjectionTask;
  readonly files: readonly MaterializedFile[];
};

type PlannedProjection = {
  readonly manifest: HarborProjectionManifest;
  readonly tasks: readonly PlannedTask[];
};

function taskBytesDigest(files: readonly MaterializedFile[]): Digest {
  return stableDigest({
    files: files.map(({ path, bytes }) => ({
      path,
      digest: stableDigest({ bytesBase64: bytes.toString("base64") }),
    })),
  });
}

function renderInstruction(task: CandidateTask): string {
  const evidence = task.evidence
    .map(({ id, content }) => `- [${id}] ${content}`)
    .join("\n");
  const context =
    task.context.length === 0
      ? "No prior decision records are supplied."
      : task.context.map(({ id, content }) => `- ${id}: ${content}`).join("\n");
  const references = task.output.requiredReferenceIds
    .map((id) => `- [${id}]`)
    .join("\n");
  return `# Instruction

${task.instruction}

## Evidence

${evidence}

## Prior decision records

${context}

## Output contract

Write one UTF-8 text response without a byte-order mark to
\`/workspace/answer.txt\`. The file must not exceed ${task.output.maxBytes}
bytes and must include every required evidence reference:

${references}
`;
}

function renderTaskToml(directory: string): string {
  return `schema_version = "${HARBOR_TASK_SCHEMA}"
artifacts = ["/workspace/answer.txt"]

[task]
name = "openboa/${directory}"
version = "${RELEASE_ID}"
description = "Fixed synthetic decision-context task"
authors = [{ name = "OpenBoa AI" }]
keywords = ["synthetic", "decision-context"]

[verifier]
timeout_sec = 30.0
environment_mode = "separate"

[agent]
timeout_sec = 300.0

[environment]
network_mode = "no-network"
build_timeout_sec = 120.0
cpus = 1
memory_mb = 512
storage_mb = 1024
gpus = 0
`;
}

function verifierScript(task: CandidateTask): string {
  const contract = Buffer.from(
    JSON.stringify({
      maxBytes: task.output.maxBytes,
      requiredReferenceIds: task.output.requiredReferenceIds,
    }),
  ).toString("base64");
  return `#!/bin/sh
set -eu
answer_path="\${ANSWER_PATH:-/workspace/answer.txt}"
reward_path="\${REWARD_PATH:-/logs/verifier/reward.txt}"
exec python3 - "$answer_path" "$reward_path" "${contract}" <<'PY'
import base64
import json
import os
import stat
import sys
from pathlib import Path

answer_path, reward_path, encoded = sys.argv[1:]
contract = json.loads(base64.b64decode(encoded))
valid = False
fd = None
try:
    if not hasattr(os, "O_NOFOLLOW"):
        raise OSError("O_NOFOLLOW is required")
    fd = os.open(answer_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    metadata = os.fstat(fd)
    if stat.S_ISREG(metadata.st_mode) and metadata.st_size <= contract["maxBytes"]:
        data = b""
        while len(data) <= contract["maxBytes"]:
            chunk = os.read(fd, min(65536, contract["maxBytes"] + 1 - len(data)))
            if not chunk:
                break
            data += chunk
        text = data.decode("utf-8", errors="strict")
        valid = (
            len(data) == metadata.st_size
            and not data.startswith(b"\\xef\\xbb\\xbf")
            and all(f"[{reference}]" in text for reference in contract["requiredReferenceIds"])
        )
except (OSError, UnicodeDecodeError):
    pass
finally:
    if fd is not None:
        os.close(fd)

reward = Path(reward_path)
reward.parent.mkdir(parents=True, exist_ok=True)
reward.write_text("1\\n" if valid else "0\\n", encoding="ascii")
PY
`;
}

function solutionScript(task: CandidateTask): string {
  const artifact = Buffer.from(
    `Structural projection check.\n${task.output.requiredReferenceIds
      .map((id) => `[${id}]`)
      .join("\n")}\n`,
    "utf8",
  ).toString("base64");
  return `#!/bin/sh
set -eu
answer_path="\${ANSWER_PATH:-/workspace/answer.txt}"
python3 - "$answer_path" "${artifact}" <<'PY'
import base64
import sys
from pathlib import Path

answer_path, encoded = sys.argv[1:]
answer = Path(answer_path)
answer.parent.mkdir(parents=True, exist_ok=True)
answer.write_bytes(base64.b64decode(encoded))
PY
`;
}

function materializedFiles(
  task: CandidateTask,
  directory: string,
): readonly MaterializedFile[] {
  return [
    { path: "task.toml", bytes: Buffer.from(renderTaskToml(directory)) },
    { path: "instruction.md", bytes: Buffer.from(renderInstruction(task)) },
    {
      path: "environment/Dockerfile",
      bytes: Buffer.from(`FROM ${PYTHON_IMAGE}\nWORKDIR /workspace\n`),
    },
    {
      path: "solution/solve.sh",
      bytes: Buffer.from(solutionScript(task)),
      mode: 0o755,
    },
    {
      path: "tests/test.sh",
      bytes: Buffer.from(verifierScript(task)),
      mode: 0o755,
    },
  ];
}

function planProjection(bank: ValidatedBank): PlannedProjection {
  const tasks: PlannedTask[] = [];
  for (const { entry, manifest } of bank.cases) {
    for (const [conditionIndex, condition] of BENCHMARK_CONDITIONS.entries()) {
      const trialSeed = stableDigest({
        bankDigest: bank.manifest.bankDigest,
        manifestDigest: entry.manifestDigest,
        conditionIndex,
      });
      const trialId = `trial-${trialSeed.slice(7, 31)}`;
      const task = renderCase(manifest, { trialId, condition });
      const directory = `task-${task.taskDigest.slice(7, 31)}`;
      const files = materializedFiles(task, directory);
      tasks.push({
        files,
        manifest: {
          caseId: manifest.caseId,
          condition,
          trialId,
          taskDigest: task.taskDigest,
          directory,
          taskBytesDigest: taskBytesDigest(files),
        },
      });
    }
  }
  if (
    tasks.length !== 80 ||
    new Set(tasks.map(({ manifest }) => manifest.directory)).size !== 80
  ) {
    throw new TypeError(
      "the fixed Harbor projection must contain 80 unique tasks",
    );
  }
  const semantic = {
    release: RELEASE_ID,
    harborTaskSchema: HARBOR_TASK_SCHEMA,
    bankDigest: bank.manifest.bankDigest,
    tasks: tasks.map(({ manifest }) => manifest),
  };
  return {
    tasks,
    manifest: { ...semantic, projectionDigest: stableDigest(semantic) },
  };
}

async function pathState(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function assertRealDirectory(path: string, message: string) {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new TypeError(message);
  }
}

async function prepareOutput(rawOutputRoot: string): Promise<string> {
  if (!isAbsolute(rawOutputRoot)) {
    throw new TypeError("output root must be absolute");
  }
  const outputRoot = resolve(rawOutputRoot);
  if (await pathState(outputRoot)) {
    throw new TypeError("output root must not exist");
  }
  if (!(await stat(dirname(outputRoot))).isDirectory()) {
    throw new TypeError("output parent must be a directory");
  }
  await assertRealDirectory(
    dirname(outputRoot),
    "output parent path must not contain symlinks",
  );
  return outputRoot;
}

async function writeTask(root: string, task: PlannedTask): Promise<void> {
  const taskRoot = join(root, task.manifest.directory);
  await mkdir(taskRoot);
  await Promise.all(
    ["environment", "solution", "tests"].map((path) =>
      mkdir(join(taskRoot, path)),
    ),
  );
  await Promise.all(
    task.files.map((file) =>
      writeFile(join(taskRoot, file.path), file.bytes, {
        flag: "wx",
        mode: file.mode ?? 0o644,
      }),
    ),
  );
}

async function assertEntries(
  root: string,
  expected: readonly string[],
  label: string,
): Promise<void> {
  const actual = (await readdir(root)).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
    throw new TypeError(`${label} has unexpected files`);
  }
}

async function assertRegularFileBytes(
  path: string,
  expected: Buffer,
  mismatchMessage: string,
): Promise<void> {
  let handle;
  try {
    handle = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
  } catch (error) {
    throw new TypeError(`${path} must be a regular file`, { cause: error });
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size !== expected.length) {
      throw new TypeError(mismatchMessage);
    }
    const bytes = Buffer.alloc(expected.length + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    if (
      offset !== expected.length ||
      !bytes.subarray(0, offset).equals(expected)
    ) {
      throw new TypeError(mismatchMessage);
    }
  } finally {
    await handle.close();
  }
}

async function verifyMaterialization(
  outputRoot: string,
  projection: PlannedProjection,
): Promise<void> {
  await assertRealDirectory(
    outputRoot,
    "projection path must not contain symlinks",
  );
  await assertEntries(
    outputRoot,
    [
      "projection-manifest.json",
      ...projection.tasks.map(({ manifest }) => manifest.directory),
    ],
    "projection root",
  );
  const expectedManifest = Buffer.from(
    `${JSON.stringify(projection.manifest, null, 2)}\n`,
  );
  await assertRegularFileBytes(
    join(outputRoot, "projection-manifest.json"),
    expectedManifest,
    "projection manifest does not match the validated bank",
  );
  for (const task of projection.tasks) {
    const taskRoot = join(outputRoot, task.manifest.directory);
    const taskMetadata = await lstat(taskRoot);
    if (!taskMetadata.isDirectory() || taskMetadata.isSymbolicLink()) {
      throw new TypeError("projection task must be a regular directory");
    }
    await assertEntries(
      taskRoot,
      ["task.toml", "instruction.md", "environment", "solution", "tests"],
      task.manifest.directory,
    );
    for (const directory of ["environment", "solution", "tests"] as const) {
      const metadata = await lstat(join(taskRoot, directory));
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new TypeError("projection task directory must not be a symlink");
      }
    }
    await assertEntries(
      join(taskRoot, "environment"),
      ["Dockerfile"],
      task.manifest.directory,
    );
    await assertEntries(
      join(taskRoot, "solution"),
      ["solve.sh"],
      task.manifest.directory,
    );
    await assertEntries(
      join(taskRoot, "tests"),
      ["test.sh"],
      task.manifest.directory,
    );
    for (const file of task.files) {
      await assertRegularFileBytes(
        join(taskRoot, file.path),
        file.bytes,
        `materialized task bytes do not match: ${task.manifest.directory}`,
      );
    }
  }
}

export async function projectHarborBank(input: {
  readonly bankRoot: string;
  readonly outputRoot: string;
}): Promise<HarborProjectionManifest> {
  const outputRoot = await prepareOutput(input.outputRoot);
  const projection = planProjection(
    await validateBank(resolve(input.bankRoot)),
  );
  const staging = await mkdtemp(join(dirname(outputRoot), ".harbor-project-"));
  let moved = false;
  try {
    await Promise.all(projection.tasks.map((task) => writeTask(staging, task)));
    await writeFile(
      join(staging, "projection-manifest.json"),
      `${JSON.stringify(projection.manifest, null, 2)}\n`,
      { flag: "wx" },
    );
    await verifyMaterialization(staging, projection);
    if (await pathState(outputRoot)) {
      throw new TypeError("output root must not exist");
    }
    await rename(staging, outputRoot);
    moved = true;
    return projection.manifest;
  } finally {
    if (!moved) await rm(staging, { force: true, recursive: true });
  }
}

export async function verifyHarborProjection(input: {
  readonly bankRoot: string;
  readonly outputRoot: string;
}): Promise<HarborProjectionManifest> {
  const projection = planProjection(
    await validateBank(resolve(input.bankRoot)),
  );
  await verifyMaterialization(resolve(input.outputRoot), projection);
  return projection.manifest;
}

async function main(args: readonly string[]) {
  if (args.length !== 2) {
    throw new TypeError("usage: project.ts <bank-root> <absolute-output-root>");
  }
  return projectHarborBank({ bankRoot: args[0]!, outputRoot: args[1]! });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void main(process.argv.slice(2)).then(
    (manifest) => process.stdout.write(`${JSON.stringify(manifest)}\n`),
    (error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    },
  );
}

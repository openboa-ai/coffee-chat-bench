import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  projectHarborBank,
  verifyHarborProjection,
} from "../harbor/project.ts";
import { validateArtifact } from "../src/artifact.ts";
import { validateBank } from "../src/bank.ts";
import { BENCHMARK_CONDITIONS, parseCaseManifest } from "../src/contracts.ts";

const execFileAsync = promisify(execFile);
const bankRoot = resolve("bank");

async function withTempDirectory(run: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "bench-harbor-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test("projects the exact public bank into a sealed candidate-neutral Harbor dataset", async () => {
  await withTempDirectory(async (directory) => {
    const outputRoot = join(directory, "projection");
    const manifest = await projectHarborBank({ bankRoot, outputRoot });
    const bank = await validateBank(bankRoot);
    const bankByCase = new Map(
      bank.cases.map((entry) => [entry.manifest.caseId, entry]),
    );

    assert.equal(manifest.tasks.length, 80);
    assert.equal(
      new Set(manifest.tasks.map(({ directory }) => directory)).size,
      80,
    );
    assert.deepEqual(
      (await readdir(outputRoot)).sort(),
      [
        "projection-manifest.json",
        ...manifest.tasks.map(({ directory }) => directory),
      ].sort(),
    );

    for (const task of manifest.tasks) {
      assert.match(task.directory, /^task-[0-9a-f]{24}$/u);
      const taskRoot = join(outputRoot, task.directory);
      assert.deepEqual((await readdir(taskRoot)).sort(), [
        "environment",
        "instruction.md",
        "solution",
        "task.toml",
        "tests",
      ]);
      const candidateFiles = await Promise.all(
        [
          "task.toml",
          "instruction.md",
          "environment/Dockerfile",
          "solution/solve.sh",
          "tests/test.sh",
        ].map((path) => readFile(join(taskRoot, path), "utf8")),
      );
      const candidateBytes = candidateFiles.join("\n");
      const source = bankByCase.get(task.caseId)!;
      const nonSelectedContext = BENCHMARK_CONDITIONS.filter(
        (condition) => condition !== task.condition,
      ).flatMap((condition) => source.manifest.contexts[condition]);
      const projections = (
        source.rubric as {
          projections: Record<string, { criterion: string; exclude: string }>;
        }
      ).projections;
      const candidateVisible = new Set([
        source.manifest.task.instruction,
        ...source.manifest.evidence.flatMap(({ id, content }) => [id, content]),
        ...source.manifest.contexts[task.condition].flatMap(
          ({ id, content }) => [id, content],
        ),
        ...source.manifest.task.output.requiredReferenceIds,
      ]);
      const evaluatorOnly = new Set(
        [
          source.manifest.caseId,
          source.manifest.familyId,
          source.manifest.targetPairBlockId,
          source.manifest.split,
          task.condition,
          task.trialId,
          ...nonSelectedContext.map(({ content }) => content),
          ...Object.keys(projections),
          ...Object.values(projections).flatMap(({ criterion, exclude }) => [
            criterion,
            exclude,
          ]),
          ...source.judgmentPlan.flatMap(({ judgmentId, pairId }) => [
            judgmentId,
            ...(pairId === null ? [] : [pairId]),
          ]),
        ].filter((value) => value.length >= 8 && !candidateVisible.has(value)),
      );
      for (const sealedValue of evaluatorOnly) {
        assert.equal(
          candidateBytes.includes(sealedValue),
          false,
          `candidate task leaked evaluator-only value: ${sealedValue}`,
        );
      }
      const toml = await readFile(join(taskRoot, "task.toml"), "utf8");
      assert.match(toml, /schema_version = "1\.4"/u);
      assert.match(toml, /artifacts = \["\/workspace\/answer\.txt"\]/u);
      assert.match(toml, /network_mode = "no-network"/u);
      assert.doesNotMatch(toml, /\benv\s*=/u);
      assert.match(
        await readFile(join(taskRoot, "environment/Dockerfile"), "utf8"),
        /^FROM python:3\.13\.7-slim-bookworm@sha256:adafcc17694d715c905b4c7bebd96907a1fd5cf183395f0ebc4d3428bd22d92d$/mu,
      );
    }

    assert.deepEqual(
      await verifyHarborProjection({ bankRoot, outputRoot }),
      manifest,
    );

    const changed = manifest.tasks[0]!;
    await writeFile(
      join(outputRoot, changed.directory, "instruction.md"),
      "material byte changed\n",
    );
    await assert.rejects(
      verifyHarborProjection({ bankRoot, outputRoot }),
      /materialized task bytes do not match/u,
    );
  });
});

test("the structural Harbor verifier agrees with the benchmark artifact contract", async () => {
  await withTempDirectory(async (directory) => {
    const outputRoot = join(directory, "projection");
    const projection = await projectHarborBank({ bankRoot, outputRoot });
    const projected = projection.tasks[0]!;
    const taskRoot = join(outputRoot, projected.directory);
    const caseManifest = parseCaseManifest(
      JSON.parse(
        await readFile(
          join(bankRoot, "cases", `${projected.caseId}.json`),
          "utf8",
        ),
      ),
    );
    const answerPath = join(directory, "answer.txt");
    const rewardPath = join(directory, "reward.txt");
    const environment = {
      ...process.env,
      ANSWER_PATH: answerPath,
      REWARD_PATH: rewardPath,
    };

    await execFileAsync("/bin/sh", [join(taskRoot, "solution/solve.sh")], {
      env: environment,
    });
    const valid = await readFile(answerPath);

    async function structuralReward(bytes: Uint8Array | null) {
      await rm(answerPath, { force: true });
      await rm(rewardPath, { force: true });
      if (bytes !== null) await writeFile(answerPath, bytes);
      await execFileAsync("/bin/sh", [join(taskRoot, "tests/test.sh")], {
        env: environment,
      });
      return Number((await readFile(rewardPath, "utf8")).trim());
    }

    const required = caseManifest.task.output.requiredReferenceIds
      .map((id) => `[${id}]`)
      .join("\n");
    const cases = [
      valid,
      Buffer.from("missing references\n", "utf8"),
      Buffer.from(`\ufeff${required}\n`, "utf8"),
      Buffer.concat([Buffer.from([0xff]), Buffer.from(required, "utf8")]),
      Buffer.from(
        `${"x".repeat(caseManifest.task.output.maxBytes + 1)}${required}`,
        "utf8",
      ),
    ];
    for (const bytes of cases) {
      assert.equal(
        await structuralReward(bytes),
        validateArtifact(caseManifest, bytes).state === "valid" ? 1 : 0,
      );
    }
    assert.equal(await structuralReward(null), 0);

    const validTarget = join(directory, "valid-target.txt");
    await writeFile(validTarget, valid);
    await rm(answerPath, { force: true });
    await symlink(validTarget, answerPath);
    await rm(rewardPath, { force: true });
    await execFileAsync("/bin/sh", [join(taskRoot, "tests/test.sh")], {
      env: environment,
    });
    assert.equal(Number((await readFile(rewardPath, "utf8")).trim()), 0);

    await rm(answerPath, { force: true });
    await rm(rewardPath, { force: true });
    await execFileAsync("mkfifo", [answerPath]);
    await execFileAsync("/bin/sh", [join(taskRoot, "tests/test.sh")], {
      env: environment,
      timeout: 1_000,
    });
    assert.equal(Number((await readFile(rewardPath, "utf8")).trim()), 0);
  });
});

test("projection creation requires an absolute new output directory", async () => {
  await withTempDirectory(async (directory) => {
    await assert.rejects(
      projectHarborBank({
        bankRoot,
        outputRoot: "relative-projection",
      }),
      /output root must be absolute/u,
    );

    const existing = join(directory, "existing");
    await mkdir(existing);
    await assert.rejects(
      projectHarborBank({ bankRoot, outputRoot: existing }),
      /output root must not exist/u,
    );

    const realParent = join(directory, "real-parent");
    const linkedParent = join(directory, "linked-parent");
    await mkdir(realParent);
    await symlink(realParent, linkedParent);
    await assert.rejects(
      projectHarborBank({
        bankRoot,
        outputRoot: join(linkedParent, "projection"),
      }),
      /output parent path must not contain symlinks/u,
    );
  });
});

test("projection verification rejects intermediate directory symlinks", async () => {
  await withTempDirectory(async (directory) => {
    const outputRoot = join(directory, "projection");
    const projection = await projectHarborBank({ bankRoot, outputRoot });
    const taskRoot = join(outputRoot, projection.tasks[0]!.directory);
    const original = join(taskRoot, "environment");
    const external = join(directory, "external-environment");
    await rename(original, external);
    await symlink(external, original);

    await assert.rejects(
      verifyHarborProjection({ bankRoot, outputRoot }),
      /projection task directory must not be a symlink/u,
    );
  });
});

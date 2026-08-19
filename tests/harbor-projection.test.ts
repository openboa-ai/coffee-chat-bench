import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { promisify } from "node:util";

import {
  HARBOR_TASK_CENSUS,
  projectHarborBank,
  verifyHarborProjection,
} from "../harbor/project.ts";
import { validateBank } from "../src/bank.ts";

const execFile = promisify(execFileCallback);

test("Harbor projection materializes exactly 96 candidate tasks from public inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "judgment-history-harbor-"));
  try {
    const outputRoot = join(root, "projection");
    const projection = await projectHarborBank({
      bankRoot: "bank",
      outputRoot,
    });
    assert.equal(HARBOR_TASK_CENSUS, 96);
    assert.equal(projection.tasks.length, 96);
    assert.equal(
      new Set(projection.tasks.map(({ directory }) => directory)).size,
      96,
    );
    const bank = await validateBank("bank");
    for (const task of projection.tasks) {
      const instruction = await readFile(
        join(outputRoot, task.directory, "instruction.md"),
        "utf8",
      );
      const taskToml = await readFile(
        join(outputRoot, task.directory, "task.toml"),
        "utf8",
      );
      assert.match(instruction, /\/workspace\/artifact\.txt/u);
      assert.match(instruction, /\/workspace\/decision-record\.json/u);
      assert.match(
        instruction,
        /evidenceUse|tradeoffs|constraints|uncertainty/u,
      );
      assert.match(
        taskToml,
        /artifacts = \["\/workspace\/artifact\.txt", "\/workspace\/decision-record\.json"\]/u,
      );
      assert.doesNotMatch(taskToml, /answer\.txt/u);
      const source = bank.cases.find(
        ({ manifest }) => manifest.caseId === task.caseId,
      )!;
      if (source.manifest.form === "professional_artifact") {
        assert.match(instruction, /\/workspace\/input/u);
        assert.doesNotMatch(
          instruction,
          new RegExp(source.manifest.documents[0]!.content.slice(0, 32), "u"),
        );
        assert.equal(
          (await readdir(join(outputRoot, task.directory, "environment/input")))
            .length,
          source.manifest.documents.length,
        );
      }
      const otherCondition =
        task.condition === "target_a"
          ? "target_b"
          : task.condition === "target_b"
            ? "target_a"
            : undefined;
      const otherOnly = otherCondition
        ? source.manifest.contexts[otherCondition].filter(
            (record, index) =>
              record.content !==
              source.manifest.contexts[task.condition][index]?.content,
          )
        : source.manifest.contexts.target_a;
      assert.ok(
        otherOnly.every(({ content }) => !instruction.includes(content)),
      );
      assert.doesNotMatch(
        instruction,
        /target_a|target_b|pair-\d{2}|project_author_hypothesis|expectedDecisionFeatures|historyRoles|priorityCues|tieBreaker|sharedVeto|humanReviewed/iu,
      );
    }
    const projectedTask = projection.tasks[0]!;
    const taskRoot = join(outputRoot, projectedTask.directory);
    const artifactPath = join(root, "artifact.txt");
    const decisionRecordPath = join(root, "decision-record.json");
    const rewardPath = join(root, "reward.txt");
    const environment = {
      ...process.env,
      ARTIFACT_PATH: artifactPath,
      DECISION_RECORD_PATH: decisionRecordPath,
      REWARD_PATH: rewardPath,
    };
    await execFile(join(taskRoot, "solution/solve.sh"), { env: environment });
    await execFile(join(taskRoot, "tests/test.sh"), { env: environment });
    assert.equal(await readFile(rewardPath, "utf8"), "1\n");

    const decisionRecord = JSON.parse(
      await readFile(decisionRecordPath, "utf8"),
    ) as { evidenceUse: { sourceId: string }[] };
    decisionRecord.evidenceUse[0]!.sourceId = "hidden-source";
    await writeFile(decisionRecordPath, JSON.stringify(decisionRecord), "utf8");
    await execFile(join(taskRoot, "tests/test.sh"), { env: environment });
    assert.equal(await readFile(rewardPath, "utf8"), "0\n");

    assert.deepEqual(
      await verifyHarborProjection({ bankRoot: "bank", outputRoot }),
      projection,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

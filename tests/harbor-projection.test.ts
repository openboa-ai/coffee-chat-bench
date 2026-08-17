import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  HARBOR_TASK_CENSUS,
  projectHarborBank,
  verifyHarborProjection,
} from "../harbor/project.ts";
import { validateBank } from "../src/bank.ts";

test("Harbor projection materializes exactly 96 candidate tasks without evaluator material", async () => {
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
      const source = bank.cases.find(
        ({ manifest }) => manifest.caseId === task.caseId,
      )!;
      const other = ["unconditioned", "target_a", "target_b"]
        .filter((condition) => condition !== task.condition)
        .flatMap((condition) =>
          source.manifest.contexts[
            condition as "unconditioned" | "target_a" | "target_b"
          ].slice(0, 5),
        );
      assert.ok(other.every(({ content }) => !instruction.includes(content)));
      assert.doesNotMatch(
        instruction,
        /criterion|evaluator|target_a|target_b|pair-\d{2}/iu,
      );
    }
    assert.deepEqual(
      await verifyHarborProjection({ bankRoot: "bank", outputRoot }),
      projection,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

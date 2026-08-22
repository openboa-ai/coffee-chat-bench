import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("Luna runner rejects an output-token limit above the approved ceiling", () => {
  const root = mkdtempSync(join(tmpdir(), "coffee-chat-bench-runner-"));
  try {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/run-luna-qualification-step.mjs",
        "--transport",
        join(root, "unused-transport.mjs"),
        "--root",
        root,
        "--max-output-tokens",
        "2049",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /--max-output-tokens must be between 1 and 2048/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Luna runner requires an explicit mini plan for mini batches", () => {
  const root = mkdtempSync(join(tmpdir(), "coffee-chat-bench-runner-"));
  try {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/run-luna-qualification-step.mjs",
        "--transport",
        join(root, "unused-transport.mjs"),
        "--root",
        root,
        "--kind",
        "mini",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--mini-plan is required/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Luna runner does not accept a mini plan for a full iteration", () => {
  const root = mkdtempSync(join(tmpdir(), "coffee-chat-bench-runner-"));
  try {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/run-luna-qualification-step.mjs",
        "--transport",
        join(root, "unused-transport.mjs"),
        "--root",
        root,
        "--kind",
        "full",
        "--mini-plan",
        join(root, "mini.json"),
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--mini-plan is only valid/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

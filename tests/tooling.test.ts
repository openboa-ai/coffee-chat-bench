import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("Git ignores installed dependencies and normal generated outputs", () => {
  const paths = [
    "node_modules/",
    "coverage/",
    "dist/",
    "tsconfig.tsbuildinfo",
    "__pycache__/",
    "harbor/__pycache__/",
    "harbor/verifier.pyc",
  ];
  const result = spawnSync("git", ["check-ignore", "--stdin"], {
    cwd: root,
    encoding: "utf8",
    input: `${paths.join("\n")}\n`,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), paths);
});

test("public CLI has no single-projection calibration and judge is its only provider-capable branch", () => {
  const cli = readFileSync(new URL("../src/cli.ts", import.meta.url), "utf8");
  const publicUsage = [
    new URL("../README.md", import.meta.url),
    new URL(
      "../docs/superpowers/plans/2026-08-12-pcda-judgment-entrypoint.md",
      import.meta.url,
    ),
  ].map((path) => readFileSync(path, "utf8"));

  assert.equal(cli.includes('command === "calibrate"'), false);
  assert.equal(cli.includes("runCalibration"), false);
  assert.equal(cli.includes("node:child_process"), false);
  assert.equal(
    [...publicUsage, cli].some((source) =>
      source.includes("calibrate <projection-root> <artifact>"),
    ),
    false,
  );
  assert.match(cli, /async function runJudge\(/u);
  assert.match(cli, /createTransport: createOpenAiResponsesTransport/u);
});

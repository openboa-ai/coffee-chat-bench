import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

function check(repository) {
  return spawnSync(
    process.execPath,
    [
      join(repository, "scripts", "check-inactive-boundary.mjs"),
      "--root",
      repository,
    ],
    { encoding: "utf8" },
  );
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "inactive-benchmark-"));
  const repository = join(directory, "repository");
  cpSync(root, repository, {
    recursive: true,
    filter: (path) => {
      const components = path.split("/");
      return (
        !components.includes(".git") && !components.includes("node_modules")
      );
    },
  });
  return { directory, repository };
}

test("inactive boundary accepts only the declared documentation and governance state", () => {
  const result = check(root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("inactive boundary rejects a candidate import outside validity documentation", () => {
  const temp = fixture();
  try {
    writeFileSync(
      join(temp.repository, "docs", "quality-map.md"),
      "candidate import\n",
    );

    const result = check(temp.repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /forbidden content/u);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
});

test("inactive boundary rejects an executable benchmark surface", () => {
  const temp = fixture();
  try {
    mkdirSync(join(temp.repository, "tasks"));
    writeFileSync(
      join(temp.repository, "tasks", "placeholder.md"),
      "blocked\n",
    );

    const result = check(temp.repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /forbidden path/u);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
});

test("inactive boundary rejects provisional benchmark terms in activation criteria", () => {
  for (const term of ["task", "case", "metric", "dataset", "score", "result"]) {
    const temp = fixture();
    try {
      writeFileSync(
        join(temp.repository, "docs", "validity", "activation-criteria.md"),
        `# Activation criteria\n\nProvisional ${term} material is forbidden.\n`,
      );

      const result = check(temp.repository);
      assert.notEqual(result.status, 0, term);
      assert.match(result.stderr, /forbidden content/u, term);
    } finally {
      rmSync(temp.directory, { force: true, recursive: true });
    }
  }
});

test("inactive boundary does not permit a second validity document", () => {
  const temp = fixture();
  try {
    writeFileSync(
      join(temp.repository, "docs", "validity", "provisional.md"),
      "Provisional benchmark task material is forbidden.\n",
    );

    const result = check(temp.repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unapproved path/u);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
});

test("inactive boundary rejects executable material hidden under migration docs", () => {
  const temp = fixture();
  try {
    writeFileSync(
      join(temp.repository, "docs", "migration", "scorer.mjs"),
      ["export const ", "metric", " = () => 1;\n"].join(""),
    );

    const result = check(temp.repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unapproved path|forbidden content/u);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
});

test("inactive boundary rejects executable benchmark code hidden in a control file", () => {
  const temp = fixture();
  try {
    const checker = join(
      temp.repository,
      "scripts",
      "check-inactive-boundary.mjs",
    );
    const hiddenBenchmark = [
      "export const ",
      "metrics",
      " = { ",
      "score",
      ": (candidate) => candidate.result };\n",
    ].join("");
    writeFileSync(
      checker,
      `${readFileSync(checker, "utf8")}\n${hiddenBenchmark}`,
    );

    const result = check(temp.repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /forbidden executable content/u);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
});

test("inactive boundary rejects a force-added node_modules file", () => {
  const temp = fixture();
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: temp.repository });
    execFileSync("git", ["config", "user.name", "Bench fixture"], {
      cwd: temp.repository,
    });
    execFileSync("git", ["config", "user.email", "bench@example.invalid"], {
      cwd: temp.repository,
    });
    const hidden = join(temp.repository, "node_modules", "scorer.mjs");
    mkdirSync(join(temp.repository, "node_modules"), { recursive: true });
    writeFileSync(hidden, ["export const ", "score", " = () => 1;\n"].join(""));
    execFileSync("git", ["add", "-f", "node_modules/scorer.mjs"], {
      cwd: temp.repository,
    });

    const result = check(temp.repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /forbidden tracked path/u);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
});

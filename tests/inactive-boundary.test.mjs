import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
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

function updateControlSurfaceDigest(repository, path) {
  const policyPath = join(repository, ".github", "merge-policy.json");
  const policy = JSON.parse(readFileSync(policyPath, "utf8"));
  const bytes = readFileSync(join(repository, path));
  policy.inactive_control_surface[path] = createHash("sha256")
    .update(bytes)
    .digest("hex");
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
}

function fixture({ initializeGit = true } = {}) {
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
  if (initializeGit) {
    execFileSync("git", ["init", "--quiet"], { cwd: repository });
    execFileSync("git", ["add", "--all"], { cwd: repository });
  }
  mkdirSync(join(repository, "node_modules"));
  symlinkSync(
    join(root, "node_modules", "prettier"),
    join(repository, "node_modules", "prettier"),
  );
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

test("inactive boundary rejects undeclared executable logic in the control surface", () => {
  const temp = fixture();
  try {
    const checker = join(
      temp.repository,
      "scripts",
      "check-inactive-boundary.mjs",
    );
    writeFileSync(
      checker,
      `${readFileSync(checker, "utf8")}\nconst assess = (transcript) => transcript.length; void assess;\n`,
    );

    const result = check(temp.repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /closed control module executable boundary/u);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
});

test("inactive boundary rejects an exported control function after its mutable digest is updated", () => {
  const temp = fixture();
  try {
    const path = "scripts/check-inactive-boundary.mjs";
    const checker = join(temp.repository, path);
    writeFileSync(
      checker,
      `${readFileSync(checker, "utf8")}\nexport function grade(transcript) { return transcript.length; }\n`,
    );
    updateControlSurfaceDigest(temp.repository, path);

    const result = check(temp.repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /closed control module export/u);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
});

test("inactive boundary rejects non-exported evaluator shapes after the mutable digest is updated", () => {
  const scenarios = [
    {
      name: "function declaration",
      source: "function grade(transcript) { return transcript.length; }\n",
    },
    {
      name: "bound arrow function",
      source: "const rank = (artifact) => artifact.length;\n",
    },
    {
      name: "bound function expression",
      source:
        "const compare = function (left, right) { return left === right; };\n",
    },
    {
      name: "class method",
      source: "class Review { inspect(value) { return value.length; } }\n",
    },
    {
      name: "immediately invoked callable",
      source: '((value) => value.length)("sample");\n',
    },
    {
      name: "top-level callback computation",
      source: 'const observations = ["sample"].map((value) => value.length);\n',
    },
    {
      name: "function reachable only from top-level initialization",
      source:
        'function inspect(value) { return value.length; }\nconst observations = ["sample"].map(inspect);\n',
    },
  ];

  for (const scenario of scenarios) {
    const temp = fixture();
    try {
      const path = "scripts/check-inactive-boundary.mjs";
      const checker = join(temp.repository, path);
      writeFileSync(
        checker,
        `${readFileSync(checker, "utf8")}\n${scenario.source}`,
      );
      updateControlSurfaceDigest(temp.repository, path);

      const result = check(temp.repository);
      assert.notEqual(result.status, 0, scenario.name);
      assert.match(
        result.stderr,
        /closed control module executable boundary/u,
        scenario.name,
      );
    } finally {
      rmSync(temp.directory, { force: true, recursive: true });
    }
  }
});

test("inactive boundary rejects an exported tree without Git tracking evidence", () => {
  const temp = fixture({ initializeGit: false });
  try {
    const result = check(temp.repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /tracked-path evidence unavailable/u);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
});

test("inactive boundary rejects force-added node_modules files at every depth", () => {
  for (const path of [
    "node_modules/scorer.mjs",
    "docs/node_modules/scorer.mjs",
  ]) {
    const temp = fixture();
    try {
      updateControlSurfaceDigest(
        temp.repository,
        "tests/inactive-boundary.test.mjs",
      );
      const hidden = join(temp.repository, path);
      mkdirSync(join(hidden, ".."), { recursive: true });
      writeFileSync(
        hidden,
        ["export const ", "score", " = () => 1;\n"].join(""),
      );
      execFileSync("git", ["add", "-f", path], { cwd: temp.repository });

      const result = check(temp.repository);
      assert.notEqual(result.status, 0, path);
      assert.match(result.stderr, /forbidden tracked path/u, path);
    } finally {
      rmSync(temp.directory, { force: true, recursive: true });
    }
  }
});

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
const benchmarkDirectories = [
  "cases",
  "candidates",
  "datasets",
  "eval",
  "metrics",
  "pilots",
  "results",
  "runners",
  "scorers",
  "schemas",
  "src",
  "tasks",
  "verifiers",
];
const publicDocumentClaims = [
  ["AGENTS.md", "\nTask: preference ranking\n"],
  ["README.md", "\n## Dataset\n"],
  ["SECURITY.md", "\nMetric = 0.92\n"],
  ["docs/quality-map.md", "\nScore: 95\n"],
  ["docs/validity/activation-criteria.md", "\nResult = accepted\n"],
  [".github/PULL_REQUEST_TEMPLATE.md", "\n## Leaderboard\n"],
];
const markdownClaimVariants = [
  ["list declaration", "\n- Task: preference ranking\n"],
  ["heading suffix", "\n## Results by model\n"],
  ["inline-code status", "\nRepository status: `active`.\n"],
  ["bold list declaration", "\n- **Task**: preference ranking\n"],
  ["bold heading suffix", "\n## **Results** by model\n"],
  ["bold status", "\nRepository status: **active**.\n"],
];
const qualityWorkflow = join(root, ".github", "workflows", "quality.yml");

function workflowStep(name) {
  const lines = readFileSync(qualityWorkflow, "utf8").split("\n");
  const start = lines.indexOf(`      - name: ${name}`);
  assert.notEqual(start, -1, `missing workflow step: ${name}`);
  const next = lines.findIndex(
    (line, index) => index > start && line.startsWith("      - name: "),
  );
  const block = lines.slice(start + 1, next === -1 ? lines.length : next);
  const condition = block
    .find((line) => line.startsWith("        if: "))
    ?.slice("        if: ".length);
  const run = block.indexOf("        run: |");
  assert.notEqual(run, -1, `missing workflow script: ${name}`);
  const script = block
    .slice(run + 1)
    .filter((line) => line.startsWith("          ") || line === "")
    .map((line) => line.slice(10))
    .join("\n");
  return { condition, script };
}

function runAuthorGate({ event, association, login }) {
  const gate = workflowStep("Verify trusted pull request author");
  assert.equal(gate.condition, "github.event_name == 'pull_request'");
  if (event !== "pull_request") return { status: 0 };
  const env = { ...process.env };
  if (association === undefined) delete env.AUTHOR_ASSOCIATION;
  else env.AUTHOR_ASSOCIATION = association;
  if (login === undefined) delete env.PR_AUTHOR_LOGIN;
  else env.PR_AUTHOR_LOGIN = login;
  return spawnSync("bash", ["-e", "-o", "pipefail", "-c", gate.script], {
    encoding: "utf8",
    env,
  });
}
function check(repository) {
  return spawnSync(
    process.execPath,
    [join(root, "scripts", "check-inactive-boundary.mjs"), "--root", repository],
    { encoding: "utf8" },
  );
}
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "inactive-benchmark-"));
  const repository = join(directory, "repository");
  cpSync(root, repository, {
    recursive: true,
    filter: (path) => ![".git", "node_modules"].includes(path.split("/").at(-1)),
  });
  execFileSync("git", ["init", "--quiet"], { cwd: repository });
  execFileSync("git", ["add", "--all"], { cwd: repository });
  return { directory, repository };
}
function withFixture(assertion) {
  const temp = fixture();
  try {
    assertion(temp.repository);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
}
test("accepts the declared not_active repository boundary", () => {
  withFixture((repository) => {
    const result = check(repository);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /"repository_status":"not_active"/u);
  });
});

test("enforces member-only author eligibility for pull requests", () => {
  const scenarios = [
    ["owner", { event: "pull_request", association: "OWNER" }, true],
    ["member", { event: "pull_request", association: "MEMBER" }, true],
    ["collaborator", { event: "pull_request", association: "COLLABORATOR" }, false],
    ["contributor", { event: "pull_request", association: "CONTRIBUTOR" }, false],
    ["none", { event: "pull_request", association: "NONE" }, false],
    ["missing association", { event: "pull_request" }, false],
    [
      "openboa login with none",
      { event: "pull_request", association: "NONE", login: "openboa" },
      false,
    ],
    ["merge group", { event: "merge_group" }, true],
  ];

  for (const [name, input, allowed] of scenarios) {
    const result = runAuthorGate(input);
    if (allowed) assert.equal(result.status, 0, result.stderr || name);
    else assert.notEqual(result.status, 0, name);
  }
});
test("requires the public not_active status in each public boundary document", () => {
  for (const path of ["AGENTS.md", "README.md"]) {
    withFixture((repository) => {
      const document = join(repository, path);
      writeFileSync(
        document,
        readFileSync(document, "utf8").replaceAll("not_active", "inactive"),
      );

      const result = check(repository);
      assert.notEqual(result.status, 0, path);
      assert.match(result.stderr, /missing public not_active status/u, path);
    });
  }
});
test("rejects concrete benchmark claims in every public document", () => {
  for (const [path, claim] of publicDocumentClaims) {
    withFixture((repository) => {
      const document = join(repository, path);
      writeFileSync(document, `${readFileSync(document, "utf8")}${claim}`);

      const result = check(repository);
      assert.notEqual(result.status, 0, path);
      assert.match(result.stderr, /concrete benchmark claim/u, path);
    });
  }
});

test("rejects an active repository-status declaration", () => {
  withFixture((repository) => {
    const document = join(repository, "README.md");
    writeFileSync(
      document,
      `${readFileSync(document, "utf8")}\nRepository status: active\n`,
    );

    const result = check(repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /concrete benchmark claim/u);
  });
});

test("rejects normalized Markdown forms of concrete claims", () => {
  for (const [name, claim] of markdownClaimVariants) {
    withFixture((repository) => {
      const document = join(repository, "README.md");
      writeFileSync(document, `${readFileSync(document, "utf8")}${claim}`);

      const result = check(repository);
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, /concrete benchmark claim/u, name);
    });
  }
});

test("rejects every benchmark-bearing directory category", () => {
  for (const directory of benchmarkDirectories) {
    withFixture((repository) => {
      mkdirSync(join(repository, directory));
      writeFileSync(join(repository, directory, "placeholder.md"), "absent\n", {
      });
      execFileSync("git", ["add", directory], { cwd: repository });

      const result = check(repository);
      assert.notEqual(result.status, 0, directory);
      assert.match(result.stderr, /forbidden benchmark path|forbidden path/u, directory);
    });
  }
});

test("rejects an unapproved executable source", () => {
  withFixture((repository) => {
    writeFileSync(
      join(repository, "scripts", "runner.mjs"),
      "process.stdout.write('benchmark');\n",
    );
    execFileSync("git", ["add", "scripts/runner.mjs"], { cwd: repository });

    const result = check(repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unapproved path/u);
  });
});

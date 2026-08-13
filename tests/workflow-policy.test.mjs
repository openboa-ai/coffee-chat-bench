import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

import { loadPolicyParser } from "../.github/policy-bootstrap.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const { parse } = loadPolicyParser(repositoryRoot);
const checker = join(repositoryRoot, ".github/ci-policy.mjs");

async function withFixture(mutate, check) {
  const fixture = await mkdtemp(join(tmpdir(), "bench-workflow-policy-"));
  try {
    await cp(
      join(repositoryRoot, "package.json"),
      join(fixture, "package.json"),
    );
    await cp(
      join(repositoryRoot, "package-lock.json"),
      join(fixture, "package-lock.json"),
    );
    await cp(join(repositoryRoot, ".github"), join(fixture, ".github"), {
      recursive: true,
    });
    await cp(join(repositoryRoot, "CODEOWNERS"), join(fixture, "CODEOWNERS"));
    await mutate(fixture);
    await check(fixture);
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
}

async function replace(fixture, relativePath, from, to) {
  const path = join(fixture, relativePath);
  const source = await readFile(path, "utf8");
  assert.ok(source.includes(from), `fixture source must include ${from}`);
  await writeFile(path, source.replace(from, to));
}

async function runChecker(
  fixture,
  { candidateChecker = false, env = {} } = {},
) {
  try {
    const checkerPath = candidateChecker
      ? join(fixture, ".github/ci-policy.mjs")
      : checker;
    const result = await execFileAsync(process.execPath, [checkerPath], {
      env: { ...process.env, ...env, BENCH_CI_POLICY_ROOT: fixture },
    });
    return { output: `${result.stdout}${result.stderr}`, status: 0 };
  } catch (error) {
    const failure =
      /** @type {{code?: number, stderr?: string, stdout?: string}} */ (error);
    return {
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
      status: failure.code,
    };
  }
}

async function expectRejected(mutate, message) {
  await withFixture(mutate, async (fixture) => {
    const result = await runChecker(fixture);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, message);
  });
}

test("accepts the checked-in workflow policy", async () => {
  const result = await runChecker(repositoryRoot);
  assert.equal(result.status, 0, result.output);
});

test("authenticates the isolated parser lock before loading its code", async () => {
  await withFixture(
    async (fixture) => {
      const parserRoot = join(fixture, ".github/policy-parser");
      const lockPath = join(parserRoot, "package-lock.json");
      const lock = await readFile(lockPath, "utf8");
      await writeFile(
        lockPath,
        lock.replace(
          "sha512-2AvhNX3m",
          "sha512-candidateSelectedParserMustNeverExecuteBeforeAuthentication",
        ),
      );
      const packageRoot = join(parserRoot, "node_modules/yaml");
      await rm(packageRoot, { force: true, recursive: true });
      await mkdir(packageRoot, { recursive: true });
      await writeFile(
        join(packageRoot, "package.json"),
        `${JSON.stringify({ name: "yaml", version: "0.0.0", main: "index.cjs" })}\n`,
      );
      await writeFile(
        join(packageRoot, "index.cjs"),
        `require("node:fs").writeFileSync(process.env.BENCH_POLICY_MARKER, "executed\\n"); module.exports = { parseDocument() { throw new Error("candidate parser executed"); } };\n`,
      );
    },
    async (fixture) => {
      const marker = join(fixture, "candidate-parser-executed");
      const result = await runChecker(fixture, {
        candidateChecker: true,
        env: { BENCH_POLICY_MARKER: marker },
      });
      assert.equal(result.status, 1, result.output);
      assert.equal(
        existsSync(marker),
        false,
        "candidate-selected parser code executed before lock authentication",
      );
      assert.match(result.output, /authenticated before loading/u);
    },
  );
});

test("rejects a competing parser shrinkwrap before loading code", async () => {
  await expectRejected(
    (fixture) =>
      writeFile(
        join(fixture, ".github/policy-parser/npm-shrinkwrap.json"),
        `${JSON.stringify({ lockfileVersion: 3, packages: {} })}\n`,
      ),
    /npm-shrinkwrap\.json.*absent before loading/u,
  );
});

test("runs isolated structural policy before candidate dependencies and delegated scripts", async () => {
  const workflow = parse(
    await readFile(
      join(repositoryRoot, ".github/workflows/quality.yml"),
      "utf8",
    ),
  );
  const runs = workflow.jobs.quality.steps
    .map((step) => step.run)
    .filter((run) => typeof run === "string");
  const parserInstallIndex = runs.indexOf(
    "npm ci --ignore-scripts --prefix .github/policy-parser",
  );
  const parserAuthenticationIndex = runs.indexOf(
    "node .github/policy-bootstrap.mjs",
  );
  const installIndex = runs.indexOf("npm ci --ignore-scripts");
  const policyIndex = runs.indexOf("node .github/ci-policy.mjs");
  const delegatedIndex = runs.findIndex((run) => run.startsWith("npm run "));

  assert.equal(parserInstallIndex, parserAuthenticationIndex + 1);
  assert.equal(policyIndex, parserInstallIndex + 1);
  assert.ok(policyIndex < installIndex);
  assert.ok(policyIndex < delegatedIndex);
  const checkerSource = await readFile(checker, "utf8");
  assert.doesNotMatch(checkerSource, /from ["']yaml["']/u);
  assert.match(checkerSource, /policy-bootstrap\.mjs/u);
});

test("standard local policy and test commands install the isolated parser", async () => {
  const packageJson = JSON.parse(
    await readFile(join(repositoryRoot, "package.json"), "utf8"),
  );
  assert.equal(
    packageJson.scripts["policy:install"],
    "node .github/policy-bootstrap.mjs && npm ci --ignore-scripts --prefix .github/policy-parser",
  );
  assert.match(packageJson.scripts.test, /^npm run policy:install && /u);
  assert.match(
    packageJson.scripts["ci:policy"],
    /^npm run policy:install && /u,
  );
});

test("rejects a dependency lock redirected away from the npm registry", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        "package-lock.json",
        "https://registry.npmjs.org/prettier/-/prettier-3.9.6.tgz",
        "https://attacker.invalid/prettier-3.9.6.tgz",
      ),
    /package lock must preserve registry identity and integrity/u,
  );
});

test("rejects dependency aliases and an altered isolated parser integrity", async () => {
  await expectRejected(async (fixture) => {
    await replace(
      fixture,
      "package.json",
      '"prettier": "3.9.6"',
      '"prettier": "npm:attacker@1.0.0"',
    );
    await replace(
      fixture,
      ".github/policy-parser/package-lock.json",
      "sha512-2AvhNX3m",
      "sha512-0AvhNX3m",
    );
  }, /approved dependency contract|isolated policy parser/u);
});

test("rejects an oversized workflow before parsing", async () => {
  await expectRejected(
    (fixture) =>
      writeFile(
        join(fixture, ".github/workflows/quality.yml"),
        `#${"x".repeat(256 * 1024)}\n`,
      ),
    /document byte limit/u,
  );
});

test("rejects workflow alias expansion before structural traversal", async () => {
  await expectRejected(
    (fixture) =>
      writeFile(
        join(fixture, ".github/workflows/quality.yml"),
        `anchor: &shared { value: safe }\naliases: [${Array.from({ length: 200 }, () => "*shared").join(", ")}]\n`,
      ),
    /alias resource limit/u,
  );
});

test("rejects workflow depth and node expansion before policy recursion", async () => {
  let deep = "leaf: safe\n";
  for (let depth = 0; depth < 40; depth += 1) {
    deep = `level-${depth}:\n${deep
      .split("\n")
      .filter(Boolean)
      .map((line) => `  ${line}`)
      .join("\n")}\n`;
  }
  await expectRejected(
    (fixture) =>
      writeFile(join(fixture, ".github/workflows/quality.yml"), deep),
    /document depth limit/u,
  );
  await expectRejected(
    (fixture) =>
      writeFile(
        join(fixture, ".github/workflows/quality.yml"),
        `items:\n${Array.from({ length: 10_001 }, () => "  - safe").join("\n")}\n`,
      ),
    /document node limit/u,
  );
});

test("rejects duplicate YAML mapping keys", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/quality.yml",
        "name: Bench quality\n",
        "name: Bench quality\nname: Duplicate quality\n",
      ),
    /workflow must parse uniquely/u,
  );
});

test("rejects escaped job-level write permissions", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/quality.yml",
        "    permissions:\n      contents: read",
        '    "permiss\\u0069ons":\n      contents: write',
      ),
    /job permissions/u,
  );
});

test("rejects flow-style escaped unpinned actions", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/quality.yml",
        "      - name: Check out repository without persisted credentials",
        '      - { "u\\u0073es": actions/checkout@v7 }\n      - name: Check out repository without persisted credentials',
      ),
    /unapproved action/u,
  );
});

test("rejects aliased unpinned actions", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/quality.yml",
        "      - name: Check out repository without persisted credentials",
        "      - &unpinned\n        uses: actions/checkout@v7\n      - *unpinned\n      - name: Check out repository without persisted credentials",
      ),
    /unapproved action/u,
  );
});

test("rejects future workflows", async () => {
  await expectRejected(
    (fixture) =>
      writeFile(
        join(fixture, ".github/workflows/future.yml"),
        "name: Future\non:\n  workflow_dispatch:\npermissions: {}\njobs:\n  future:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 15\n    steps:\n      - run: 'true'\n",
      ),
    /workflow set/u,
  );
});

test("rejects future workflows with the alternate YAML extension", async () => {
  await expectRejected(
    (fixture) =>
      writeFile(
        join(fixture, ".github/workflows/future.yaml"),
        "name: Future\non:\n  workflow_dispatch:\npermissions: {}\njobs:\n  future:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 15\n    steps:\n      - run: 'true'\n",
      ),
    /workflow set/u,
  );
});

test("rejects an extra pull_request_target trigger", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/quality.yml",
        "  pull_request:\n",
        "  pull_request:\n  pull_request_target: {}\n",
      ),
    /approved triggers/u,
  );
});

test("rejects a missing bounded timeout", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/quality.yml",
        "    timeout-minutes: 15\n",
        "",
      ),
    /timeout-minutes/u,
  );
});

test("rejects a weakened owner-member or Dependabot gate", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/quality.yml",
        "OWNER|MEMBER",
        "CONTRIBUTOR",
      ),
    /OWNER\|MEMBER or Dependabot author gate/u,
  );
});

test("rejects removing maintainer identity binding", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/quality.yml",
        '    test "$ACTOR" = "$PR_AUTHOR_LOGIN"\n',
        "",
      ),
    /OWNER\|MEMBER or Dependabot author gate/u,
  );
});

test("rejects weakening trusted-boundary maintainer identity binding", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/secret-boundary.yml",
        "github.actor == github.event.pull_request.user.login &&\n",
        "",
      ),
    /trusted author boundary/u,
  );
});

test("rejects a disabled author eligibility job", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/quality.yml",
        "    name: Bench author eligibility\n",
        "    name: Bench author eligibility\n    if: ${{ false }}\n",
      ),
    /author gate/u,
  );
});

test("rejects dependency review without the moderate policy", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/policy.yml",
        "          fail-on-severity: moderate\n",
        "",
      ),
    /dependency-review inputs/u,
  );
});

test("rejects re-enabling a merge-group workflow", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/policy.yml",
        "  pull_request:\n",
        "  pull_request:\n  merge_group:\n",
      ),
    /approved triggers/u,
  );
});

test("rejects removing the exact Dependabot identity policy", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/merge-policy.json",
        '  "eligible_bot_logins": ["dependabot[bot]"],\n',
        "",
      ),
    /zero-approval GitHub-native squash/u,
  );
});

test("rejects weakening sensitive paths or check integration IDs", async () => {
  await expectRejected(async (fixture) => {
    await replace(
      fixture,
      ".github/merge-policy.json",
      '    "/harbor/**",\n',
      "",
    );
    await replace(
      fixture,
      ".github/merge-policy.json",
      '"integration_id": 15368',
      '"integration_id": 0',
    );
  }, /exact GitHub Actions checks|exact sensitive paths/u);
});

test("rejects removal or relocation of the quality policy step", async () => {
  await expectRejected(async (fixture) => {
    await replace(
      fixture,
      ".github/workflows/quality.yml",
      "      - run: npm run ci:policy\n",
      "",
    );
    await replace(
      fixture,
      ".github/workflows/quality.yml",
      "jobs:\n",
      "jobs:\n  auxiliary:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 15\n    permissions:\n      contents: read\n    steps:\n      - run: npm run ci:policy\n\n",
    );
  }, /exact fail-closed candidate quality steps/u);
});

test("rejects removal of the direct pre-delegation policy gate", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/quality.yml",
        "      - name: Enforce repository policy before candidate dependencies\n        run: node .github/ci-policy.mjs\n",
        "",
      ),
    /exact fail-closed candidate quality steps/u,
  );
});

test("rejects loading the isolated parser before lock authentication", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/quality.yml",
        "      - name: Authenticate the isolated policy parser lock\n        run: node .github/policy-bootstrap.mjs\n",
        "",
      ),
    /exact fail-closed candidate quality steps/u,
  );
});

test("rejects required CI live-model execution", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/quality.yml",
        "      - run: npm run check:inactive\n",
        "      - run: node --experimental-strip-types src/cli.ts judge live-input\n      - run: npm run check:inactive\n",
      ),
    /live model execution/u,
  );
});

for (const [name, workflow, before, after] of [
  [
    "CodeQL write-capable job",
    ".github/workflows/codeql.yml",
    "      - name: Analyze with CodeQL\n",
    "      - run: echo unexpected\n      - name: Analyze with CodeQL\n",
  ],
  [
    "candidate quality job",
    ".github/workflows/quality.yml",
    "      - run: npm run ci:policy\n",
    "      - run: echo unexpected\n      - run: npm run ci:policy\n",
  ],
  [
    "trusted secret boundary",
    ".github/workflows/secret-boundary.yml",
    "    steps:\n",
    "    env:\n      LEAK: ${{ secrets.OPENAI_API_KEY }}\n    steps:\n",
  ],
]) {
  test(`rejects added executable behavior in the ${name}`, async () => {
    await expectRejected(
      (fixture) => replace(fixture, workflow, before, after),
      /exact|secret|CodeQL/u,
    );
  });
}

test("rejects a failure-tolerant trusted secret scan", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/workflows/secret-boundary.yml",
        "      - name: Scan candidate without executing it\n",
        "      - name: Scan candidate without executing it\n        continue-on-error: true\n",
      ),
    /exact|Gitleaks/u,
  );
});

for (const path of [
  "/scripts/check-inactive-boundary.mjs",
  "/schemas/judge-campaign.schema.json",
  "/src/**",
]) {
  test(`rejects removing sensitive judgment path ${path}`, async () => {
    await expectRejected(async (fixture) => {
      const policyPath = join(fixture, ".github/merge-policy.json");
      const policy = JSON.parse(await readFile(policyPath, "utf8"));
      policy.protected_paths = policy.protected_paths.filter(
        (candidate) => candidate !== path,
      );
      await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
    }, /exact sensitive paths/u);
  });
}

test("checked-in policy protects every judgment trust boundary", async () => {
  const policy = JSON.parse(
    await readFile(join(repositoryRoot, ".github/merge-policy.json"), "utf8"),
  );
  const protectedPaths = policy.protected_paths;
  for (const path of [
    "/scripts/check-inactive-boundary.mjs",
    "/schemas/judge-campaign.schema.json",
    "/src/admission.ts",
    "/src/bank.ts",
    "/src/bounded-fs.ts",
    "/src/calibration.ts",
    "/src/cli.ts",
    "/src/contracts.ts",
    "/src/digest.ts",
    "/src/identity.ts",
    "/src/judge-campaign.ts",
    "/src/judge-config.ts",
    "/src/judge-panel.ts",
    "/src/judgment.ts",
    "/src/materializer.ts",
    "/src/metrics.ts",
    "/src/openai-judge.ts",
    "/src/projector.ts",
    "/src/validity.ts",
  ]) {
    assert.ok(
      protectedPaths.some(
        (pattern) =>
          pattern === path ||
          (pattern === "/src/**" && path.startsWith("/src/")),
      ),
      path,
    );
  }
});

test("rejects removing independent ownership from benchmark trust boundaries", async () => {
  await expectRejected(
    (fixture) => writeFile(join(fixture, "CODEOWNERS"), "/src/** @openboa\n"),
    /CODEOWNERS must preserve exact sensitive ownership/u,
  );
});

test("rejects a Dependabot ignore that can suppress security updates", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        ".github/dependabot.yml",
        "    groups:\n",
        '    ignore:\n      - dependency-name: "*"\n        update-types: [version-update:semver-major]\n    groups:\n',
      ),
    /update policy|parse uniquely/u,
  );
});

test("rejects weakening the package policy command", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        "package.json",
        "npm run policy:install && node --test tests/workflow-policy.test.mjs && node .github/ci-policy.mjs",
        "node .github/ci-policy.mjs",
      ),
    /package command/u,
  );
});

test("rejects weakening a required package script", async () => {
  await expectRejected(
    (fixture) =>
      replace(
        fixture,
        "package.json",
        '"test": "npm run policy:install && node --experimental-strip-types --test tests/*.test.mjs tests/*.test.ts"',
        '"test": "true"',
      ),
    /package scripts/u,
  );
});

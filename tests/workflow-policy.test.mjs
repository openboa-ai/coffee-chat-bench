import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const checker = join(repositoryRoot, ".github/ci-policy.mjs");

async function withFixture(mutate, check) {
  const fixture = await mkdtemp(join(tmpdir(), "bench-workflow-policy-"));
  try {
    await cp(
      join(repositoryRoot, "package.json"),
      join(fixture, "package.json"),
    );
    await cp(join(repositoryRoot, ".github"), join(fixture, ".github"), {
      recursive: true,
    });
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

async function runChecker(fixture) {
  try {
    const result = await execFileAsync(process.execPath, [checker], {
      env: { ...process.env, BENCH_CI_POLICY_ROOT: fixture },
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
  "/src/cli.ts",
  "/src/judge-campaign.ts",
  "/src/judge-config.ts",
  "/src/judge-panel.ts",
  "/src/judgment.ts",
]) {
  test(`rejects removing sensitive judgment path ${path}`, async () => {
    await expectRejected(
      (fixture) =>
        replace(fixture, ".github/merge-policy.json", `    "${path}",\n`, ""),
      /exact sensitive paths/u,
    );
  });
}

test("checked-in policy protects every judgment trust boundary", async () => {
  const policy = JSON.parse(
    await readFile(join(repositoryRoot, ".github/merge-policy.json"), "utf8"),
  );
  for (const path of [
    "/src/cli.ts",
    "/src/judge-campaign.ts",
    "/src/judge-config.ts",
    "/src/judge-panel.ts",
    "/src/judgment.ts",
    "/src/openai-judge.ts",
  ]) {
    assert.ok(policy.protected_paths.includes(path), path);
  }
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
        "node --test tests/workflow-policy.test.mjs && node .github/ci-policy.mjs",
        "node .github/ci-policy.mjs",
      ),
    /package command/u,
  );
});

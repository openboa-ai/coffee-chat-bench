import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

const root = resolve(
  process.env.BENCH_CI_POLICY_ROOT ??
    resolve(dirname(fileURLToPath(import.meta.url)), ".."),
);
const workflowRoot = resolve(root, ".github/workflows");
const failures = [];
const workflowNames = [
  "codeql.yml",
  "policy.yml",
  "quality.yml",
  "secret-boundary.yml",
];
const pinnedActions = new Set([
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  "actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294",
  "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  "github/codeql-action/analyze@5595ccaf912efad79be6eef63a5619ff05969be3",
  "github/codeql-action/init@5595ccaf912efad79be6eef63a5619ff05969be3",
]);
const candidateWorkflows = new Set(["codeql.yml", "policy.yml", "quality.yml"]);
const requiredCommands = [
  "npm run format:check",
  "npm run check:inactive",
  "npm run typecheck",
  "npm test",
  "npm run ci:policy",
];
const eligibilityGate = `case "$EVENT_NAME" in
  pull_request)
    case "$AUTHOR_ASSOCIATION" in
      OWNER|MEMBER)
        test "$ACTOR" = "$PR_AUTHOR_LOGIN"
        test "$HEAD_REPOSITORY" = "$BASE_REPOSITORY"
        ;;
      *)
        test "$ACTOR" = 'dependabot[bot]'
        test "$PR_AUTHOR_LOGIN" = 'dependabot[bot]'
        test "$HEAD_REPOSITORY" = "$BASE_REPOSITORY"
        ;;
    esac
    ;;
  *) exit 1 ;;
esac
`;
const eligibilityEnv = {
  ACTOR: "${{ github.actor }}",
  AUTHOR_ASSOCIATION: "${{ github.event.pull_request.author_association }}",
  BASE_REPOSITORY: "${{ github.repository }}",
  EVENT_NAME: "${{ github.event_name }}",
  HEAD_REPOSITORY: "${{ github.event.pull_request.head.repo.full_name }}",
  PR_AUTHOR_LOGIN: "${{ github.event.pull_request.user.login }}",
};
const qualitySecretScan = [
  "test ! -e .gitleaks.toml",
  "test ! -e .gitleaksignore",
  'gitleaks git --config "$GITLEAKS_TRUSTED_CONFIG" \\',
  "  --gitleaks-ignore-path /dev/null --ignore-gitleaks-allow \\",
  "  --redact --no-banner .",
  'gitleaks dir --config "$GITLEAKS_TRUSTED_CONFIG" \\',
  "  --gitleaks-ignore-path /dev/null --ignore-gitleaks-allow \\",
  "  --redact --no-banner .",
  "",
].join("\n");
const boundarySecretScan = [
  "set -o pipefail",
  "test ! -e candidate/.gitleaks.toml",
  "test ! -e candidate/.gitleaksignore",
  "ignore_path=/dev/null",
  'gitleaks git --config "$GITLEAKS_TRUSTED_CONFIG" \\',
  '  --gitleaks-ignore-path "$ignore_path" --ignore-gitleaks-allow \\',
  '  --redact --no-banner "$GITHUB_WORKSPACE/candidate"',
  'gitleaks dir --config "$GITLEAKS_TRUSTED_CONFIG" \\',
  '  --gitleaks-ignore-path "$ignore_path" --ignore-gitleaks-allow \\',
  '  --redact --no-banner "$GITHUB_WORKSPACE/candidate"',
  'blob_dir="$(mktemp -d)"',
  'if test -n "$BASE_SHA"; then',
  "  git -C candidate fetch --no-tags --depth=1 \\",
  '    "https://github.com/$BASE_REPOSITORY.git" "$BASE_SHA"',
  '  object_range="$BASE_SHA..$HEAD_SHA"',
  "else",
  '  object_range="$HEAD_SHA"',
  "fi",
  'git -C candidate rev-list --objects "$object_range" |',
  "  cut -d' ' -f1 |",
  "  git -C candidate cat-file --batch-check='%(objectname) %(objecttype)' |",
  "  awk '$2 == \"blob\" { print $1 }' |",
  "  while read -r object_id; do",
  '    git -C candidate cat-file blob "$object_id" > "$blob_dir/$object_id"',
  "  done",
  'gitleaks dir --config "$GITLEAKS_TRUSTED_CONFIG" \\',
  '  --gitleaks-ignore-path "$ignore_path" --ignore-gitleaks-allow \\',
  '  --redact --no-banner "$blob_dir"',
  "",
].join("\n");

function fail(message) {
  failures.push(message);
}

function equal(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isRecord(value) && equal(Object.keys(value).sort(), [...keys].sort());
}

function steps(job) {
  return Array.isArray(job?.steps) ? job.steps : [];
}

function collectUses(value, uses = [], seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return uses;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectUses(item, uses, seen);
    return uses;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === "uses") uses.push(item);
    collectUses(item, uses, seen);
  }
  return uses;
}

function collectRuns(value, runs = [], seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return runs;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectRuns(item, runs, seen);
    return runs;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === "run" && typeof item === "string") runs.push(item);
    collectRuns(item, runs, seen);
  }
  return runs;
}

function validateShape(name, workflow) {
  if (
    !isRecord(workflow) ||
    !exactKeys(workflow, ["name", "on", "permissions", "concurrency", "jobs"])
  ) {
    fail(`${name}: workflow shape`);
    return;
  }
  if (
    !exactKeys(workflow.concurrency, ["group", "cancel-in-progress"]) ||
    typeof workflow.concurrency.group !== "string" ||
    !workflow.concurrency.group.includes("github.workflow") ||
    workflow.concurrency["cancel-in-progress"] !== true
  ) {
    fail(`${name}: concurrency`);
  }
  if (!isRecord(workflow.jobs)) {
    fail(`${name}: jobs mapping`);
    return;
  }
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    if (!isRecord(job) || job["timeout-minutes"] !== 15) {
      fail(`${name}: ${jobName} timeout-minutes must be 15`);
    }
  }
}

function validateActions(name, workflow) {
  for (const action of collectUses(workflow)) {
    if (typeof action !== "string" || !pinnedActions.has(action)) {
      fail(`${name}: unapproved action ${String(action)}`);
    }
  }
  for (const job of Object.values(workflow.jobs ?? {})) {
    for (const step of steps(job)) {
      if (
        isRecord(step) &&
        typeof step.uses === "string" &&
        step.uses.startsWith("actions/checkout@") &&
        step.with?.["persist-credentials"] !== false
      ) {
        fail(`${name}: checkout persists credentials`);
      }
    }
  }
}

function validateCandidateWorkflow(name, workflow) {
  if (!exactKeys(workflow.on, ["pull_request"])) {
    fail(`${name}: approved triggers`);
  }
  if (!exactKeys(workflow.permissions, [])) {
    fail(`${name}: root permissions must be empty`);
  }
  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    if (name === "codeql.yml" && jobName === "analyze") continue;
    if (
      !isRecord(job.permissions) ||
      Object.values(job.permissions).some((permission) => permission !== "read")
    ) {
      fail(`${name}: job permissions must be read-only`);
      break;
    }
  }
}

function validateEligibility(job, name) {
  const eligibilitySteps = steps(job);
  if (
    !isRecord(job) ||
    !exactKeys(job, [
      "name",
      "runs-on",
      "timeout-minutes",
      "permissions",
      "steps",
    ]) ||
    job.name !== "Bench author eligibility" ||
    job["runs-on"] !== "ubuntu-24.04" ||
    job["timeout-minutes"] !== 15 ||
    !equal(job.permissions, { contents: "read" }) ||
    eligibilitySteps.length !== 1 ||
    !equal(eligibilitySteps[0], {
      name: "Decide author eligibility",
      env: eligibilityEnv,
      run: eligibilityGate,
    })
  ) {
    fail(`${name}: OWNER|MEMBER or Dependabot author gate`);
  }
}

function validateCodeql(workflow) {
  const { eligibility, analyze } = workflow.jobs ?? {};
  if (!exactKeys(workflow.jobs, ["eligibility", "analyze"]))
    fail("codeql.yml: exact jobs");
  validateEligibility(eligibility, "codeql.yml");
  if (
    !isRecord(analyze) ||
    !exactKeys(analyze, [
      "name",
      "needs",
      "runs-on",
      "timeout-minutes",
      "permissions",
      "steps",
    ]) ||
    analyze.name !== "Bench CodeQL JavaScript-TypeScript" ||
    analyze.needs !== "eligibility" ||
    analyze["runs-on"] !== "ubuntu-24.04" ||
    !equal(analyze.permissions, {
      contents: "read",
      actions: "read",
      "security-events": "write",
    })
  ) {
    fail("codeql.yml: CodeQL job permissions");
  }
  const codeqlSteps = steps(analyze);
  if (
    !equal(codeqlSteps, [
      {
        name: "Check out repository without persisted credentials",
        uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
        with: { "persist-credentials": false },
      },
      {
        name: "Initialize CodeQL",
        uses: "github/codeql-action/init@5595ccaf912efad79be6eef63a5619ff05969be3",
        with: { languages: "javascript-typescript", "build-mode": "none" },
      },
      {
        name: "Analyze with CodeQL",
        uses: "github/codeql-action/analyze@5595ccaf912efad79be6eef63a5619ff05969be3",
      },
    ])
  ) {
    fail("codeql.yml: exact CodeQL actions");
  }
}

function validateDependencyReview(workflow) {
  const review = workflow.jobs?.["dependency-review"];
  if (!exactKeys(workflow.jobs, ["dependency-review"]))
    fail("policy.yml: exact jobs");
  if (
    !isRecord(review) ||
    !exactKeys(review, [
      "name",
      "runs-on",
      "timeout-minutes",
      "permissions",
      "steps",
    ]) ||
    review.name !== "Bench dependency review" ||
    review["runs-on"] !== "ubuntu-24.04" ||
    !equal(review.permissions, { contents: "read" })
  ) {
    fail("policy.yml: job permissions");
  }
  const [pullRequest] = steps(review);
  if (
    steps(review).length !== 1 ||
    !isRecord(pullRequest) ||
    pullRequest.name !== "Review pull request dependencies" ||
    pullRequest.uses !==
      "actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294" ||
    !equal(pullRequest.with, {
      "fail-on-severity": "moderate",
      "fail-on-scopes": "runtime,development,unknown",
      "show-patched-versions": true,
      "comment-summary-in-pr": "never",
    })
  ) {
    fail("policy.yml: dependency-review inputs");
  }
}

function validateQuality(workflow) {
  const { eligibility, quality, aggregate } = workflow.jobs ?? {};
  if (!exactKeys(workflow.jobs, ["eligibility", "quality", "aggregate"]))
    fail("quality.yml: exact jobs");
  validateEligibility(eligibility, "quality.yml");
  if (
    !isRecord(quality) ||
    !exactKeys(quality, [
      "name",
      "needs",
      "runs-on",
      "timeout-minutes",
      "permissions",
      "steps",
    ]) ||
    quality.name !== "Bench deterministic quality" ||
    quality.needs !== "eligibility" ||
    !equal(quality.permissions, { contents: "read" })
  ) {
    fail("quality.yml: candidate checkout requires eligibility");
  }
  const qualitySteps = steps(quality);
  if (
    !equal(qualitySteps, [
      {
        name: "Check out repository without persisted credentials",
        uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
        with: { "fetch-depth": 0, "persist-credentials": false },
      },
      {
        name: "Install immutable Gitleaks",
        run: ".github/scripts/install-gitleaks.sh",
      },
      { name: "Scan complete Git history", run: qualitySecretScan },
      {
        name: "Set up Node.js",
        uses: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
        with: { "node-version": 24, cache: "npm" },
      },
      { run: "npm ci --ignore-scripts" },
      {
        name: "Enforce repository policy before delegated scripts",
        run: "node .github/ci-policy.mjs",
      },
      { run: "npm audit --audit-level=moderate" },
      ...requiredCommands.map((run) => ({ run })),
    ])
  ) {
    fail("quality.yml: exact fail-closed candidate quality steps");
  }
  if (
    collectRuns(quality).some((command) =>
      /(?:src\/cli\.ts\s+judge|OPENAI_API_KEY|npm\s+run\s+judge)\b/u.test(
        command,
      ),
    )
  ) {
    fail("quality.yml: live model execution");
  }
  if (
    !isRecord(aggregate) ||
    !exactKeys(aggregate, [
      "name",
      "if",
      "needs",
      "runs-on",
      "timeout-minutes",
      "permissions",
      "steps",
    ]) ||
    aggregate.name !== "Bench required" ||
    aggregate.if !== "always()" ||
    !equal(aggregate.needs, ["eligibility", "quality"]) ||
    !equal(aggregate.permissions, { contents: "read" }) ||
    !equal(steps(aggregate), [
      {
        name: "Require every applicable lane",
        env: {
          ELIGIBILITY_RESULT: "${{ needs.eligibility.result }}",
          QUALITY_RESULT: "${{ needs.quality.result }}",
        },
        run: 'test "$ELIGIBILITY_RESULT" = success\ntest "$QUALITY_RESULT" = success\n',
      },
    ])
  ) {
    fail("quality.yml: aggregate contract");
  }
}

function validateSecretBoundary(workflow) {
  if (!exactKeys(workflow.on, ["pull_request_target", "workflow_dispatch"])) {
    fail("secret-boundary.yml: approved triggers");
  }
  if (
    !equal(workflow.on?.pull_request_target?.types, [
      "opened",
      "synchronize",
      "reopened",
      "ready_for_review",
    ]) ||
    workflow.on?.workflow_dispatch !== null ||
    !equal(workflow.permissions, { contents: "read" }) ||
    !exactKeys(workflow.jobs, ["secret-boundary"])
  ) {
    fail("secret-boundary.yml: trusted boundary shape");
  }
  const boundary = workflow.jobs?.["secret-boundary"];
  if (
    !isRecord(boundary) ||
    !exactKeys(boundary, [
      "name",
      "if",
      "runs-on",
      "timeout-minutes",
      "steps",
    ]) ||
    boundary.name !== "Secret boundary" ||
    boundary["runs-on"] !== "ubuntu-24.04" ||
    boundary["timeout-minutes"] !== 15 ||
    boundary.if !==
      "github.event_name == 'workflow_dispatch' || (((github.event.pull_request.author_association == 'OWNER' || github.event.pull_request.author_association == 'MEMBER') && github.actor == github.event.pull_request.user.login && github.event.pull_request.head.repo.full_name == github.repository) || (github.actor == 'dependabot[bot]' && github.event.pull_request.user.login == 'dependabot[bot]' && github.event.pull_request.head.repo.full_name == github.repository))"
  ) {
    fail("secret-boundary.yml: trusted author boundary");
  }
  const boundarySteps = steps(boundary);
  if (
    !equal(boundarySteps, [
      {
        name: "Check out trusted security controls",
        uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
        with: {
          ref: "${{ github.event.pull_request.base.sha || github.sha }}",
          "fetch-depth": 1,
          "persist-credentials": false,
          path: "trusted",
        },
      },
      {
        name: "Install immutable Gitleaks from trusted base",
        run: "trusted/.github/scripts/install-gitleaks.sh",
      },
      {
        name: "Check out candidate as data only",
        uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
        with: {
          repository:
            "${{ github.event.pull_request.head.repo.full_name || github.repository }}",
          ref: "${{ github.event.pull_request.head.sha || github.sha }}",
          "fetch-depth": 0,
          "persist-credentials": false,
          path: "candidate",
        },
      },
      {
        name: "Scan candidate without executing it",
        env: {
          BASE_SHA: "${{ github.event.pull_request.base.sha || '' }}",
          BASE_REPOSITORY: "${{ github.repository }}",
          HEAD_SHA: "${{ github.event.pull_request.head.sha || github.sha }}",
        },
        run: boundarySecretScan,
      },
    ])
  ) {
    fail("secret-boundary.yml: exact fail-closed trusted Gitleaks scan");
  }
}

function validateWritePermissions(workflows) {
  for (const [name, workflow] of Object.entries(workflows)) {
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      if (
        isRecord(job.permissions) &&
        Object.entries(job.permissions).some(
          ([scope, access]) =>
            access === "write" &&
            !(
              name === "codeql.yml" &&
              jobName === "analyze" &&
              scope === "security-events"
            ),
        )
      ) {
        fail(`${name}: only CodeQL may write security events`);
      }
    }
  }
}

function validateDependabot() {
  const document = parseDocument(
    readFileSync(resolve(root, ".github/dependabot.yml"), "utf8"),
    { uniqueKeys: true },
  );
  if (document.errors.length > 0) {
    fail("dependabot.yml: must parse uniquely");
    return;
  }
  const updates = document.toJS({ maxAliasCount: -1 })?.updates;
  if (!Array.isArray(updates) || updates.length !== 2) {
    fail("dependabot.yml: exact update lanes");
    return;
  }
  const npm = updates.find((update) => update?.["package-ecosystem"] === "npm");
  const actions = updates.find(
    (update) => update?.["package-ecosystem"] === "github-actions",
  );
  const minorPatch = ["minor", "patch"];
  const compatibleVersionUpdates = [
    {
      "dependency-name": "*",
      "update-types": [
        "version-update:semver-minor",
        "version-update:semver-patch",
      ],
    },
  ];
  if (
    !equal(npm?.groups?.production, {
      "applies-to": "version-updates",
      "dependency-type": "production",
      "update-types": minorPatch,
    }) ||
    !equal(npm?.groups?.development, {
      "applies-to": "version-updates",
      "dependency-type": "development",
      "update-types": minorPatch,
    }) ||
    !equal(npm?.groups?.security, {
      "applies-to": "security-updates",
      patterns: ["*"],
    }) ||
    !equal(npm?.allow, compatibleVersionUpdates) ||
    Object.hasOwn(npm, "ignore")
  ) {
    fail("dependabot.yml: npm update policy");
  }
  if (
    !equal(actions?.groups?.versions, {
      "applies-to": "version-updates",
      "update-types": minorPatch,
      patterns: ["*"],
    }) ||
    !equal(actions?.groups?.security, {
      "applies-to": "security-updates",
      patterns: ["*"],
    }) ||
    !equal(actions?.allow, compatibleVersionUpdates) ||
    Object.hasOwn(actions, "ignore")
  ) {
    fail("dependabot.yml: GitHub Actions update policy");
  }
}

function validateMergePolicy() {
  let policy;
  try {
    policy = JSON.parse(
      readFileSync(resolve(root, ".github/merge-policy.json"), "utf8"),
    );
  } catch (error) {
    fail(
      `merge policy: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  if (
    policy.merge_method !== "squash" ||
    policy.auto_merge !== "github-native" ||
    policy.merge_queue !== false ||
    policy.required_approvals !== 0 ||
    !equal(policy.required_events, ["pull_request"]) ||
    !equal(policy.eligible_author_associations, ["OWNER", "MEMBER"]) ||
    !equal(policy.eligible_bot_logins, ["dependabot[bot]"])
  ) {
    fail("merge policy is not zero-approval GitHub-native squash");
  }
  if (
    !equal(policy.required_checks, [
      { context: "Bench required", integration_id: 15368 },
      { context: "Bench dependency review", integration_id: 15368 },
      { context: "Secret boundary", integration_id: 15368 },
      {
        context: "Bench CodeQL JavaScript-TypeScript",
        integration_id: 15368,
      },
    ])
  ) {
    fail("merge policy must require exact GitHub Actions checks");
  }
  if (
    !equal(policy.protected_paths, [
      "/.github/**",
      "/.githooks/**",
      "/.gitleaksignore",
      "/.gitleaks.toml",
      "/AGENTS.md",
      "/CODEOWNERS",
      "/SECURITY.md",
      "/config/judges/**",
      "/harbor/**",
      "/schemas/judge-campaign.schema.json",
      "/src/bank.ts",
      "/src/bounded-fs.ts",
      "/src/cli.ts",
      "/src/contracts.ts",
      "/src/digest.ts",
      "/src/identity.ts",
      "/src/judge-campaign.ts",
      "/src/judge-config.ts",
      "/src/judge-panel.ts",
      "/src/judgment.ts",
      "/src/openai-judge.ts",
      "/src/projector.ts",
    ])
  ) {
    fail("merge policy must preserve exact sensitive paths");
  }
}

const discovered = readdirSync(workflowRoot)
  .filter((name) => /\.ya?ml$/u.test(name))
  .sort();
if (!equal(discovered, workflowNames)) fail("workflow set must be exact");

const workflows = {};
for (const name of workflowNames) {
  const document = parseDocument(
    readFileSync(resolve(workflowRoot, name), "utf8"),
    { uniqueKeys: true },
  );
  if (document.errors.length > 0) {
    fail(`${name}: workflow must parse uniquely`);
    continue;
  }
  const workflow = document.toJS({ maxAliasCount: -1 });
  workflows[name] = workflow;
  validateShape(name, workflow);
  validateActions(name, workflow);
  if (candidateWorkflows.has(name)) validateCandidateWorkflow(name, workflow);
}

if (workflows["codeql.yml"]) validateCodeql(workflows["codeql.yml"]);
if (workflows["policy.yml"]) validateDependencyReview(workflows["policy.yml"]);
if (workflows["quality.yml"]) validateQuality(workflows["quality.yml"]);
if (workflows["secret-boundary.yml"])
  validateSecretBoundary(workflows["secret-boundary.yml"]);
validateWritePermissions(workflows);

const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
if (
  packageJson.scripts?.["ci:policy"] !==
  "node --test tests/workflow-policy.test.mjs && node .github/ci-policy.mjs"
) {
  fail("package command must run fixtures before the checker");
}
const expectedPackageScripts = {
  "ci:policy":
    "node --test tests/workflow-policy.test.mjs && node .github/ci-policy.mjs",
  test: "node --experimental-strip-types --test tests/*.test.mjs tests/*.test.ts",
  typecheck: "tsc --noEmit",
  format:
    'prettier --write package.json package-lock.json tsconfig.json prettier.config.mjs docs/quality-map.md docs/validity/*.md perspectives/*.json "bank/**/*.json" schemas/*.json scripts/*.mjs src/*.ts tests/*.test.mjs tests/*.test.ts tests/fixtures/**/*.json tests/fixtures/projection/artifacts/echo.json tests/fixtures/projection/artifacts/judgment-access.json tests/fixtures/projection/artifacts/list-all.json tests/fixtures/projection/artifacts/no-op.json tests/fixtures/projection/artifacts/oracle.json',
  "format:check":
    'prettier --check package.json package-lock.json tsconfig.json prettier.config.mjs docs/quality-map.md docs/validity/*.md perspectives/*.json "bank/**/*.json" schemas/*.json scripts/*.mjs src/*.ts tests/*.test.mjs tests/*.test.ts tests/fixtures/**/*.json tests/fixtures/projection/artifacts/echo.json tests/fixtures/projection/artifacts/judgment-access.json tests/fixtures/projection/artifacts/list-all.json tests/fixtures/projection/artifacts/no-op.json tests/fixtures/projection/artifacts/oracle.json',
  "check:inactive": "node scripts/check-inactive-boundary.mjs --root .",
};
if (
  !equal(
    Object.entries(packageJson.scripts ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
    Object.entries(expectedPackageScripts).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
) {
  fail("package scripts must remain exact");
}
validateDependabot();
validateMergePolicy();

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("CI policy passed\n");
}

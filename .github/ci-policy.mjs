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
    case "$AUTHOR_ASSOCIATION" in OWNER|MEMBER) exit 0 ;; esac
    test "$ACTOR" = 'dependabot[bot]'
    test "$PR_AUTHOR_LOGIN" = 'dependabot[bot]'
    test "$HEAD_REPOSITORY" = "$BASE_REPOSITORY"
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

function runIndex(jobSteps, command) {
  return jobSteps.findIndex((step) => isRecord(step) && step.run === command);
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
    codeqlSteps[0]?.uses !==
      "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1" ||
    codeqlSteps[1]?.uses !==
      "github/codeql-action/init@5595ccaf912efad79be6eef63a5619ff05969be3" ||
    codeqlSteps[1]?.with?.languages !== "javascript-typescript" ||
    codeqlSteps[1]?.with?.["build-mode"] !== "none" ||
    codeqlSteps[2]?.uses !==
      "github/codeql-action/analyze@5595ccaf912efad79be6eef63a5619ff05969be3"
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
    quality.name !== "Bench deterministic quality" ||
    quality.needs !== "eligibility" ||
    !equal(quality.permissions, { contents: "read" })
  ) {
    fail("quality.yml: candidate checkout requires eligibility");
  }
  const qualitySteps = steps(quality);
  const checkout = qualitySteps.findIndex((step) =>
    step?.uses?.startsWith("actions/checkout@"),
  );
  const install = runIndex(qualitySteps, "npm ci --ignore-scripts");
  const audit = runIndex(qualitySteps, "npm audit --audit-level=moderate");
  const commands = requiredCommands.map((command) =>
    runIndex(qualitySteps, command),
  );
  if (
    checkout < 0 ||
    install < 0 ||
    audit < install ||
    commands.some((index) => index < 0 || index < audit) ||
    commands.at(-1) !== qualitySteps.length - 1
  ) {
    fail(
      "quality.yml: immutable install and moderate audit precede repository scripts",
    );
  }
  if (runIndex(qualitySteps, "npm run ci:policy") < 0) {
    fail("quality.yml: quality job runs the policy command");
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
    aggregate.name !== "Bench required" ||
    aggregate.if !== "always()" ||
    !equal(aggregate.needs, ["eligibility", "quality"]) ||
    !equal(aggregate.permissions, { contents: "read" })
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
    boundary.name !== "Secret boundary" ||
    boundary["runs-on"] !== "ubuntu-latest" ||
    boundary.if !==
      "github.event_name == 'workflow_dispatch' || github.event.pull_request.author_association == 'OWNER' || github.event.pull_request.author_association == 'MEMBER' || (github.actor == 'dependabot[bot]' && github.event.pull_request.user.login == 'dependabot[bot]' && github.event.pull_request.head.repo.full_name == github.repository)"
  ) {
    fail("secret-boundary.yml: trusted author boundary");
  }
  const boundarySteps = steps(boundary);
  const trusted = boundarySteps.findIndex(
    (step) => step?.with?.path === "trusted",
  );
  const candidate = boundarySteps.findIndex(
    (step) => step?.with?.path === "candidate",
  );
  if (trusted !== 0 || candidate < 2) {
    fail(
      "secret-boundary.yml: trusted checkout before candidate data checkout",
    );
  }
  const scan = boundarySteps.at(-1)?.run;
  if (
    typeof scan !== "string" ||
    !scan.includes("set -o pipefail") ||
    !scan.includes("gitleaks git") ||
    !scan.includes("gitleaks dir") ||
    !scan.includes("git -C candidate fetch --no-tags --depth=1") ||
    /(?:^|\s)(?:npm|node)\s/u.test(scan) ||
    scan.includes("secrets.")
  ) {
    fail("secret-boundary.yml: complete trusted Gitleaks scan");
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
  const ignoreMajor = [
    { "dependency-name": "*", "update-types": ["version-update:semver-major"] },
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
    !equal(npm?.ignore, ignoreMajor)
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
    !equal(actions?.ignore, ignoreMajor)
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
      "/src/openai-judge.ts",
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
validateDependabot();
validateMergePolicy();

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("CI policy passed\n");
}

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
  merge_group) exit 0 ;;
  pull_request)
    case "$AUTHOR_ASSOCIATION" in OWNER|MEMBER) exit 0 ;; *) exit 1 ;; esac
    ;;
  *) exit 1 ;;
esac
`;

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
  if (!exactKeys(workflow.on, ["pull_request", "merge_group"])) {
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
  if (
    !isRecord(job) ||
    job.name !== "Bench author eligibility" ||
    !equal(job.permissions, { contents: "read" }) ||
    !steps(job).some((step) => step?.run === eligibilityGate)
  ) {
    fail(`${name}: OWNER|MEMBER author gate`);
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
  const [pullRequest, mergeGroup] = steps(review);
  for (const step of [pullRequest, mergeGroup]) {
    if (
      !isRecord(step) ||
      step.uses !==
        "actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294" ||
      step.with?.["fail-on-severity"] !== "moderate" ||
      step.with?.["fail-on-scopes"] !== "runtime,development,unknown" ||
      step.with?.["show-patched-versions"] !== true ||
      step.with?.["comment-summary-in-pr"] !== "never"
    ) {
      fail("policy.yml: dependency-review inputs");
      break;
    }
  }
  if (
    pullRequest?.if !== "github.event_name == 'pull_request'" ||
    mergeGroup?.if !== "github.event_name == 'merge_group'" ||
    mergeGroup?.with?.["base-ref"] !==
      "${{ github.event.merge_group.base_sha }}" ||
    mergeGroup?.with?.["head-ref"] !==
      "${{ github.event.merge_group.head_sha }}"
  ) {
    fail("policy.yml: exact merge-group refs");
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
      "github.event_name == 'workflow_dispatch' || github.event.pull_request.author_association == 'OWNER' || github.event.pull_request.author_association == 'MEMBER'"
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
    policy.required_approvals !== 0 ||
    !equal(policy.required_events, ["pull_request", "merge_group"]) ||
    !equal(policy.eligible_author_associations, ["OWNER", "MEMBER"])
  ) {
    fail("merge policy is not zero-approval GitHub-native squash");
  }
  const contexts = policy.required_checks?.map(({ context }) => context) ?? [];
  for (const context of [
    "Bench required",
    "Bench dependency review",
    "Secret boundary",
    "Bench CodeQL JavaScript-TypeScript",
  ]) {
    if (!contexts.includes(context))
      fail(`merge policy must require ${context}`);
  }
}

const discovered = readdirSync(workflowRoot)
  .filter((name) => name.endsWith(".yml"))
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

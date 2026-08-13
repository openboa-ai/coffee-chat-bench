# Bench Security Lifecycle Implementation Plan

> **Execution:** Follow strict TDD and `AGENTS.md`. Preserve the explicit
> `not_active` boundary and candidate-independent benchmark ownership.

**Goal:** Add the missing structural repository-security contract and prepare
Bench for automatic merge with human review only on governance, judge, and
external verifier boundaries.

**Architecture:** Existing advanced CodeQL, dependency review, deterministic
quality, and trusted secret workflows remain. A parsed YAML contract becomes a
required quality step and prevents policy drift. The live ruleset later supplies
human-only sensitive-path review outside the candidate tree.

**Stack:** Node.js 24, TypeScript, Python, `yaml`, Node test runner, GitHub
Actions, GitHub Rulesets, Gitleaks, CodeQL, npm.

---

## Task 1: Introduce the structural repository-security contract

**Files:**

- Add: `.github/ci-policy.mjs`
- Add: `tests/workflow-policy.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

Add exact `yaml@2.9.0` and a `ci:policy` command that runs fixture tests before
the production checker. RED fixtures cover duplicate/escaped keys, aliases,
flow-style unpinned actions, future and job-level write permissions, extra
`pull_request_target`, missing owner/member gate, removed policy step, wrong
merge-group refs, and weakened package command.

The checker enforces the exact workflow set, minimal permissions, full-SHA
action allowlist, checkout policy, timeouts, trusted secret boundary,
dependency inputs, inactive/type/test/format commands, fail-closed aggregate,
merge-policy contexts, and the package command. Only CodeQL may write
`security-events`.

**Checks:**

```bash
npm run ci:policy
node --test tests/workflow-policy.test.mjs
git diff --check
```

Commit: `test: add structural Bench workflow policy`

## Task 2: Harden deterministic CI and dependency automation

**Files:**

- Modify: `.github/workflows/codeql.yml`
- Modify: `.github/workflows/policy.yml`
- Modify: `.github/workflows/quality.yml`
- Modify: `.github/workflows/secret-boundary.yml`
- Modify: `.github/dependabot.yml`
- Add: `.github/merge-policy.json`

Use Task 1 as the RED specification, then add job timeouts, preserve read-only
tokens and pre-checkout membership gating, use `npm ci --ignore-scripts`, run a
moderate audit before repository npm scripts, and add `format:check` plus
`ci:policy` to required quality. Configure dependency review for moderate
severity, runtime/development/unknown scopes, patched versions, no comments, and
exact merge-group SHAs. Preserve trusted Gitleaks worktree/history/raw-blob
coverage. Declare the CodeQL context required. Add npm Dependabot coverage and
group compatible/security updates while suppressing routine semver-major
version-update churn.

**Checks:**

```bash
npm run ci:policy
npm run format:check
npm run typecheck
npm run check:inactive
npm test
npm audit --audit-level=moderate
actionlint .github/workflows/*.yml
git diff --check
```

Commit: `ci: harden Bench security gates`

## Task 3: Encode the selective-review agent lifecycle

**Files:**

- Modify: `AGENTS.md`
- Modify: `.github/PULL_REQUEST_TEMPLATE.md`
- Modify: `CODEOWNERS` comments only if needed

Replace the statement that all sensitive paths rely only on automated checks.
Agents must open pull requests, preserve `not_active`, report exact evidence,
and enable GitHub-native squash auto-merge. The external ruleset decides whether
governance, judge, or Harbor changes need human review. Do not introduce a
custom write-token merge controller.

**Checks:**

```bash
npm run ci:policy
npm run format:check
npm test
git diff --check
```

Commit: `docs: define selective-review Bench lifecycle`

## Task 4: Verify security closure

Run the complete clean-install suite, a focused post-change Codex Security
review, and independent whole-branch review. Prove normal source/docs paths stay
zero-approval while `.github/**`, judge configuration, OpenAI judge, and Harbor
paths match the future human reviewer. Final closure requires the live ruleset
and two confirming reads.

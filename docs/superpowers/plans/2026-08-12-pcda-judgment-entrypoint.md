# PCDA Judgment Entrypoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one Bench-owned public entrypoint that verifies a projected candidate artifact, constructs the canonical QPCFR judge input, and runs the bounded Terra/Luna panel without allowing Eval to redefine benchmark judgment.

**Architecture:** `src/judgment.ts` owns candidate-visible projection/artifact parsing, strict Eval/Harbor verifier-attestation validation, canonical prompt construction, public vote projection, and explicit result-state output. It never executes projected verifier files on the host. Eval creates one random per-execution capability key, keeps it outside the candidate, and MACs canonical attestation fields (including Bench commit/bank provenance) before separately calling `judgeProjection`. After candidate shutdown, the Eval host launcher injects it only into the host-side `judge` process as `COFFEE_CHAT_EVAL_ATTESTATION_KEY`; it never enters Harbor, the candidate environment, or argv. `src/cli.ts` exposes that module as `judge <projection-root> <artifact> <isolated-verifier-attestation>`, copies then deletes that inherited environment variable, and creates the provider transport only after MAC preflight. It has no single-projection `calibrate` path; candidate verifier execution belongs to Eval/Harbor isolation. The separate `calibrate-bank` control path starts only from a fresh validated workspace, forwards JSON judgment/artifact data only, and gives its PATH/locale-only Python batch no verifier path; `harbor/calibrate.py` imports only canonical sibling `harbor/verifier.py`. This authenticates the trusted Eval execution boundary against untrusted candidate/path forgery; it is not a claim of protection against a malicious Eval operator. `src/judge-campaign.ts` remains the only cost authority and `src/openai-judge.ts` remains the provider boundary. CI uses fake transports only; a live call occurs only through an explicit manual CLI invocation with `OPENAI_API_KEY`.

**Tech Stack:** Node.js 24, TypeScript, Node test runner, Python verifier subprocess, OpenAI Responses API, existing JSON schemas and CalVer `2026.8.12`.

## Global Constraints

- Repository status remains `not_active`; this change produces no measured result or activation claim.
- Live judge roster is exactly `gpt-5.6-terra` and `gpt-5.6-luna`; no Sol, fallback, tie-breaker, or repeated-vote majority.
- Hard campaign ceiling is exactly `50,000,000,000` nano-USD; every request is reserved before dispatch and missing/invalid usage stops all remaining slots.
- Deterministic verifier rejection makes zero provider calls.
- Candidate-visible input never contains judgment material; judgment runs only after Harbor has returned the declared artifact.
- QPCFR dimensions are conjunctive: `taskAdequate`, `evidenceIntegrity`, `perspectiveAligned`, `invariantsPreserved`, and `criticalFailure`.
- Preserve `measured`, `candidate_invalid`, `candidate_failure`, `host_failure`, `verifier_failure`, `judge_disagreement`, `judge_unavailable`, `skipped`, `unavailable`, and `unmeasured`; never coerce a non-measured state to zero.
- Raw prompts, responses, credentials, or authorization headers never enter receipts or tracked files.
- PR/CI uses deterministic fake transports and never reads `OPENAI_API_KEY`.

---

### Task 1: Canonical projection judgment and bounded manual CLI

**Files:**
- Create: `src/judgment.ts`
- Create: `tests/judgment.test.ts`
- Modify: `src/judge-campaign.ts`
- Modify: `src/openai-judge.ts`
- Modify: `src/cli.ts`
- Modify: `tests/judge-campaign.test.ts`
- Modify: `tests/openai-judge.test.ts`
- Modify: `README.md`
- Modify: `docs/quality-map.md`

**Interfaces:**
- Consumes: one `projectHarborTask` output root containing candidate-visible projection files; one candidate `/app/output.json` artifact; one strict isolated-verifier attestation from Eval/Harbor; `JudgeTransport`; the existing public config.
- Produces: `judgeProjection(input: JudgmentInput): Promise<JudgmentResult>`, `buildCanonicalJudgePanelInput(...)`, and CLI `judge <projection-root> <artifact> <isolated-verifier-attestation>`.
- `JudgmentResult` binds release, trial/case/condition/source/projection/verifier/artifact digests, MAC-authenticated Bench commit/bank provenance, deterministic verifier state, panel/public votes, explicit benchmark result state, campaign cost receipt, and a stable result digest. It never stores prompt, response bytes, capability key, or attestation MAC.

- [x] **Step 1: Write failing behavior tests**

Add literal tests that prove:

```ts
// Oracle artifact: verifier accepts, exactly Terra and Luna are called,
// public votes parse with parseJudgeVote, and outcome is measured.
// Mutating candidate-visible projection or artifact identity fails before calls.
// no-op/malformed/list-all/judgment-access artifacts make zero calls and retain
// candidate_invalid or candidate_failure.
// a verifier process/JSON failure returns verifier_failure, not candidate failure.
// model disagreement returns judge_disagreement; provider/malformed/model drift
// returns judge_unavailable; none becomes zero.
// result and receipt contain no prompt, raw response, OPENAI_API_KEY, or headers.
// canonical prompt input is identical for identical bytes and changes with any
// task, evidence, perspective, manifest, or candidate-response mutation.
```

Add campaign/transport tests proving actual prompt byte length is checked before a request and `max_output_tokens` equals the manifest ceiling sent to Responses.

- [x] **Step 2: Run the focused suite and record RED**

Run:

```sh
node --experimental-strip-types --test \
  tests/judgment.test.ts tests/judge-campaign.test.ts tests/openai-judge.test.ts
```

Expected: failure because `src/judgment.ts`, the CLI command, prompt-bound preflight, and provider output ceiling do not exist.

- [x] **Step 3: Implement strict inputs and deterministic verification**

`src/judgment.ts` must read exact candidate-visible regular files under the resolved projection root, reject all symlink ancestors, parse `projection.json`, artifact, and isolated-verifier attestation objects with exact-key checks, and never execute `harbor/tests/test.sh` or another projected verifier file on the host. The attestation binds Bench provenance, projection, verifier, candidate, and artifact digests plus required isolation evidence. Missing, malformed, contradictory, or unbound attestation becomes `verifier_failure`; attested `candidate_invalid` and `candidate_failure` remain authoritative. Only an accepted attestation can create a panel input.

- [x] **Step 4: Build the canonical QPCFR judge input**

The canonical prompt payload must contain the fixed rubric version `pcda-qpcfr-2026.8.12`, trial/case/condition/source identity, candidate-visible task/evidence/perspective, candidate manifest/response, and explicit definitions of the five dimensions. It must not expose accepted regions or the Oracle. `perspectiveAligned` means following the supplied perspective when one exists and remaining task-grounded when it is `null`. Serialize with stable canonical JSON and pass it only in memory to `runJudgeCampaign`.

- [x] **Step 5: Close request-cost bounds at the real provider boundary**

Before calculating or dispatching a campaign, reject any atom whose canonical request byte length exceeds `manifest.maxInputTokensPerRequest`; UTF-8 byte count is a conservative token upper bound. Extend `JudgeRequest` with `maxOutputTokens`, have the budgeted transport set it from the manifest, and send it to Responses as `max_output_tokens`. Keep integer nano-USD reservation and fail-closed usage settlement unchanged.

- [x] **Step 6: Project canonical votes and explicit outcome states**

Use `toPublicJudgeVotes` and `judgeOutcomeState`; do not duplicate schema or result-state logic. Deterministic failures return their exact candidate/verifier state and no campaign. Accepted verifier output plus panel agreement returns `measured`; a tie returns `judge_disagreement`; insufficient valid votes returns `judge_unavailable`. Bind all digests and receipts into `resultDigest` with `stableDigest`.

- [x] **Step 7: Add the manual CLI without provider use in CI**

`node --experimental-strip-types src/cli.ts judge <projection-root> <artifact> <isolated-verifier-attestation>` reads the one-time Eval-held capability only from inherited `COFFEE_CHAT_EVAL_ATTESTATION_KEY`, deletes it from `process.env` immediately after copying it locally, and constructs `createOpenAiResponsesTransport()` only after exact projection/artifact/attestation/MAC preflight. It emits one JSON result and exits zero only for a completed measured campaign; non-measured and invalid states remain JSON with nonzero exit. No required workflow invokes `judge` and no test uses a live transport.

- [x] **Step 8: Verify and document**

Run:

```sh
npm run format
npm run format:check
npm run typecheck
node --experimental-strip-types --test \
  tests/judgment.test.ts tests/judge-campaign.test.ts tests/openai-judge.test.ts
npm test
npm run check:inactive
node --test tests/inactive-boundary.test.mjs
git diff --check
.githooks/pre-commit
```

Update README and Quality Map to state that this is a manual, bounded experimental judgment entrypoint, not benchmark activation or a live result.

- [x] **Step 9: Commit**

```sh
git add src/judgment.ts src/judge-campaign.ts src/openai-judge.ts src/cli.ts \
  tests/judgment.test.ts tests/judge-campaign.test.ts tests/openai-judge.test.ts \
  README.md docs/quality-map.md
git commit -m "feat(bench): add bounded judgment entrypoint"
```

### Task 1: Canonical projection judgment and bounded manual CLI

> **Historical brief — execution details superseded.** Preserve this brief as
> the original Task 1 evidence. Its instruction to execute projected
> `harbor/tests/test.sh` and its old positional `judge` CLI are superseded by
> the current `docs/superpowers/plans/2026-08-12-pcda-judgment-entrypoint.md`
> and the Round 2/3 sections of `task-1-report.md`. The current boundary never
> executes projected verifier files on the host and accepts the Eval capability
> only through the host-side inherited environment after candidate shutdown.

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
- Consumes: one `projectHarborTask` output root containing `projection.json`, `verifier/judgment.json`, and `harbor/tests/test.sh`; one candidate `/app/output.json` artifact; `JudgeTransport`; the existing public config.
- Produces: `judgeProjection(input: JudgmentInput): Promise<JudgmentResult>`, `buildCanonicalJudgePanelInput(...)`, and CLI `judge <projection-root> <artifact>`.
- `JudgmentResult` binds release, trial/case/condition/source/projection/verifier/artifact digests, deterministic verifier state, panel/public votes, explicit benchmark result state, campaign cost receipt, and a stable result digest. It never stores prompt or response bytes.

- [ ] **Step 1: Write failing behavior tests**

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

- [ ] **Step 2: Run the focused suite and record RED**

Run:

```sh
node --experimental-strip-types --test \
  tests/judgment.test.ts tests/judge-campaign.test.ts tests/openai-judge.test.ts
```

Expected: failure because `src/judgment.ts`, the CLI command, prompt-bound preflight, and provider output ceiling do not exist.

- [ ] **Step 3: Implement strict inputs and deterministic verification**

`src/judgment.ts` must read exact regular files under the resolved projection root, reject symlink ancestors, parse `projection.json`, parse judgment and artifact objects with exact-key checks, and run only the projection's copied `harbor/tests/test.sh`. Parse exactly one verifier JSON object. `candidate_invalid` and `candidate_failure` are authoritative deterministic outcomes; execution/no-output/malformed verifier data becomes `verifier_failure`. Only an accepted deterministic result can create a panel input.

> **Superseded execution instruction.** Do not execute projected `test.sh` on
> the Bench host. See the current plan and Round 2/3 report sections above.

- [ ] **Step 4: Build the canonical QPCFR judge input**

The canonical prompt payload must contain the fixed rubric version `pcda-qpcfr-2026.8.12`, trial/case/condition/source identity, candidate-visible task/evidence/perspective, candidate manifest/response, and explicit definitions of the five dimensions. It must not expose accepted regions or the Oracle. `perspectiveAligned` means following the supplied perspective when one exists and remaining task-grounded when it is `null`. Serialize with stable canonical JSON and pass it only in memory to `runJudgeCampaign`.

- [ ] **Step 5: Close request-cost bounds at the real provider boundary**

Before calculating or dispatching a campaign, reject any atom whose canonical request byte length exceeds `manifest.maxInputTokensPerRequest`; UTF-8 byte count is a conservative token upper bound. Extend `JudgeRequest` with `maxOutputTokens`, have the budgeted transport set it from the manifest, and send it to Responses as `max_output_tokens`. Keep integer nano-USD reservation and fail-closed usage settlement unchanged.

- [ ] **Step 6: Project canonical votes and explicit outcome states**

Use `toPublicJudgeVotes` and `judgeOutcomeState`; do not duplicate schema or result-state logic. Deterministic failures return their exact candidate/verifier state and no campaign. Accepted verifier output plus panel agreement returns `measured`; a tie returns `judge_disagreement`; insufficient valid votes returns `judge_unavailable`. Bind all digests and receipts into `resultDigest` with `stableDigest`.

- [ ] **Step 7: Add the manual CLI without provider use in CI**

`node --experimental-strip-types src/cli.ts judge <projection-root> <artifact>` constructs `createOpenAiResponsesTransport()` only for this exact command. It emits one JSON result and exits zero only for a completed measured campaign; non-measured and invalid states remain JSON with nonzero exit. No required workflow invokes `judge` and no test uses a live transport.

> **Superseded CLI instruction.** The current CLI requires
> `judge <projection-root> <artifact> <isolated-verifier-attestation>` and reads
> `COFFEE_CHAT_EVAL_ATTESTATION_KEY` only from the Eval host process
> environment. See the current plan and Round 2/3 report sections above.

- [ ] **Step 8: Verify and document**

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

- [ ] **Step 9: Commit**

```sh
git add src/judgment.ts src/judge-campaign.ts src/openai-judge.ts src/cli.ts \
  tests/judgment.test.ts tests/judge-campaign.test.ts tests/openai-judge.test.ts \
  README.md docs/quality-map.md
git commit -m "feat(bench): add bounded judgment entrypoint"
```

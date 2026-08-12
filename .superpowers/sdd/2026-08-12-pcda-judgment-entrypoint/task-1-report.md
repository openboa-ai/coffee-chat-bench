# Task 1 implementation report — Canonical projection judgment and bounded manual CLI

## Status

Implemented in the existing `coffee-chat-bench-judge` worktree. Repository
status remains `not_active`; no provider was called and no `.env` file was
read.

## Design decisions

- `src/judgment.ts` is the Bench-owned judgment interface. It resolves the
  supplied projection root, rejects symlinks within that root, requires the
  exact projected layout, and recomputes candidate, verifier, and projection
  digests before a verifier or provider can run.
- Candidate artifacts have exact outer and manifest keys, verify their declared
  digest locally, and are passed only to the copied
  `harbor/tests/test.sh`. Candidate-invalid and candidate-failure verifier
  verdicts remain authoritative. Process, output, or verdict-shape faults are
  `verifier_failure`.
- The canonical in-memory QPCFR input uses rubric version
  `pcda-qpcfr-2026.8.12`, candidate-visible task/evidence/perspective/output
  contract, manifest, and response. It intentionally excludes verifier
  judgment, accepted regions, and the Oracle. `perspectiveAligned` explicitly
  defines both supplied-perspective and null-perspective behavior.
- The manual CLI uses a fixed one-atom bound of 32,768 UTF-8 bytes per request
  and 1,024 output tokens per request. These are conservative manual-entrypoint
  ceilings, not an activation or measurement setting. `runJudgeCampaign`
  rejects an actual encoded panel request over the input ceiling before cost
  calculation or dispatch; `BudgetedTransport` overwrites the outgoing request
  ceiling from the manifest and the Responses transport maps it to
  `max_output_tokens`.
- `judgeProjection` stores only canonical digests, public projected votes,
  explicit result state, and bounded campaign receipts. It never returns the
  canonical prompt, response body, key, or headers.

## RED evidence

Before implementation, ran:

```sh
node --experimental-strip-types --test \
  tests/judgment.test.ts tests/judge-campaign.test.ts tests/openai-judge.test.ts
```

The command failed as intended:

- `ERR_MODULE_NOT_FOUND` for `src/judgment.ts`;
- request-byte test received `budget_stopped` instead of the missing preflight
  rejection;
- output-ceiling tests observed `undefined` rather than the manifest value;
- the Responses request omitted `max_output_tokens`.

No fake transport that was required to remain unused was called, and no live
transport was constructed by the test suite.

## Changed paths

- `src/judgment.ts` — strict local projection/artifact/verifier boundary and
  canonical judgment result.
- `src/digest.ts` — exports canonical JSON serialization for the in-memory
  canonical QPCFR payload.
- `src/judge-campaign.ts`, `src/judge-panel.ts`, `src/openai-judge.ts` —
  request-byte preflight and manifest-derived output ceiling at the actual
  provider boundary.
- `src/cli.ts` — manual `judge <projection-root> <artifact>` command, with
  provider construction only on that exact branch.
- `tests/judgment.test.ts`, `tests/judge-campaign.test.ts`,
  `tests/openai-judge.test.ts` — local fixture and fake-transport coverage.
- `README.md`, `docs/quality-map.md` — manual experimental boundary and
  evidence mapping.
- `docs/superpowers/plans/2026-08-12-pcda-judgment-entrypoint.md` and this SDD
  ledger/report — completed-plan and task evidence.

## Verification

Completed:

```sh
node --experimental-strip-types --test \
  tests/judgment.test.ts tests/judge-campaign.test.ts tests/openai-judge.test.ts
# PASS: 17/17

npm run typecheck
# PASS

npm run format
# PASS

npm run format:check
# PASS

npm test
# PASS: 128/128

npm run check:inactive
# PASS: {"status":"passed","repository_status":"not_active","files":192}

node --test tests/inactive-boundary.test.mjs
# PASS: 21/21

git diff --check
# PASS
```

The repository pre-commit hook is run against the complete staged task change
immediately before the commit.

## Concerns

- The `judge` command is intentionally unexercised with a live key. Tests
  cover the provider payload through an injected fake fetch and cover the CLI
  branch by source behavior only, so this remains a manual experimental
  entrypoint rather than live-run evidence.
- A malformed projection is rejected before a `JudgmentResult` can be bound to
  verified projection metadata; the CLI serializes that boundary error as
  invalid JSON and exits nonzero. This prevents invented digests or a coerced
  benchmark state.

## Round 1 security-review fix

### Finding and root cause

The previous entrypoint recomputed only projection-controlled digests and then
used `spawnSync("sh", [<projection>/harbor/tests/test.sh])`. A caller could
therefore replace both projection metadata and `test.sh`, rehash the metadata,
and obtain host-side shell execution. It also checked symlinks only from the
supplied root downward, accepted extra structured-response fields, and the
quality workflow excluded TypeScript tests and typechecking.

### TDD RED evidence

Before the repair, ran:

```sh
node --experimental-strip-types --test tests/judgment.test.ts tests/judge-panel.test.ts
```

Expected failures were observed:

- an extra field on an otherwise valid five-boolean judge response was accepted
  as `valid` rather than `malformed`;
- missing, artifact-unbound, or non-isolated verifier attestation reached the
  panel as `judge_unavailable` rather than returning `verifier_failure` before
  transport;
- a crafted projected `harbor/tests/test.sh` caused projection processing to
  fail only through the self-declared digest check, proving the previous design
  still depended on projected verifier bytes instead of an external isolated
  result.

### Repair

- Removed all child-process execution from `src/judgment.ts`. Bench now reads
  candidate-visible projection files only and requires an exact
  `isolated_verifier_attestation` issued by Eval.
- The attestation is bound to Bench repository/commit/bank provenance and to
  trial, source, candidate, verifier, projection, and artifact digests. It
  requires evidence of candidate-only inputs, verifier-only judgment,
  `/app/output.json` as the sole transfer, disabled candidate network, and
  completed cleanup. Missing, malformed, contradictory, or unbound
  attestations return `verifier_failure` without invoking a transport.
- Symlink checks now inspect every ancestor of the supplied projection root.
- `parseJudgeDimensions` now requires a plain object with exactly the five
  schema keys and boolean values; extra fields are malformed.
- The manual CLI now requires
  `judge <projection-root> <artifact> <isolated-verifier-attestation>`. CI runs
  `npm run typecheck` and the deterministic `.mjs` plus `.ts` suite for both
  `pull_request` and `merge_group`.

### Changed paths

- `src/judgment.ts`
- `src/judge-panel.ts`
- `src/cli.ts`
- `tests/judgment.test.ts`
- `tests/judge-panel.test.ts`
- `.github/workflows/quality.yml`
- `README.md`
- `docs/quality-map.md`
- `docs/superpowers/plans/2026-08-12-pcda-judgment-entrypoint.md`

### Verification

```sh
npm run format
npm run format:check
npm run typecheck
node --experimental-strip-types --test \
  tests/judgment.test.ts tests/judge-panel.test.ts \
  tests/judge-campaign.test.ts tests/openai-judge.test.ts
npm test
npm run check:inactive
node --test tests/inactive-boundary.test.mjs
git diff --check
```

All completed checks passed. The tests use fixtures and fake transports only;
no provider call was made and `.env.local` was not read.

## Round 2 security-review fix

### Finding and trust decision

Round 1 correctly stopped host-side execution of projected verifier files, but
the resulting attestation remained only self-declared data. An untrusted
candidate that could choose a projection/artifact/attestation path could forge
matching digests and cause a panel call. In addition, the CLI constructed the
OpenAI transport before it had validated the projection boundary, so an absent
API key obscured an invalid attestation.

The bounded trust model is now explicit: the Eval orchestrator/CLI caller is
trusted and the isolated candidate is untrusted. Eval generates one random
32-byte base64url capability key per execution, keeps it outside the candidate
environment, and separately supplies it to `judgeProjection`. Eval computes an
HMAC-SHA256 `attestationMac` over canonical JSON of every strict attestation
field except `attestationMac`. Consequently, the MAC includes `benchCommit`,
`bankDigest`, trial/case identity, candidate/verifier/projection/artifact
digests, deterministic state/reason code, and isolation evidence. Bench
constant-time verifies an exact 32-byte base64url MAC before using the
attestation.

This capability authenticates the trusted Eval execution boundary against
candidate/path/attestation forgery. It is deliberately not a global signing PKI
and does not claim protection from a malicious evaluator or operator. Bench
retains MAC-bound `benchCommit` and `bankDigest` as result provenance. This
package has no simple independent canonical-bank comparison that avoids Git or
network access, so Eval must pin the exact merged Bench commit and bank digest;
the trusted-operator boundary is documented rather than represented as a false
local proof.

### TDD RED evidence

Before implementation, ran:

```sh
node --experimental-strip-types --test tests/judgment.test.ts
```

Expected RED was observed: the test module failed to import because
`src/judgment.ts` did not export `createAttestationMac`. The focused tests were
therefore unable to construct the required capability-authenticated attestation
or prove invalid-attestation CLI ordering.

### Repair

- `src/judgment.ts` now exports a per-execution capability generator and an
  HMAC constructor for the trusted Eval caller. It requires a separately passed,
  exactly encoded 32-byte capability key and verifies the strict attestation
  MAC with `timingSafeEqual` before artifact acceptance or transport creation.
- The strict attestation uses the exact `reasonCode` state mapping instead of
  arbitrary `reasons` strings. Persisted deterministic results use only the
  closed `JUDGMENT_REASON_CODES` set. Raw verifier/provider/stderr/prompt/key/
  header content is not copied into results or receipts; neither the capability
  key nor `attestationMac` is persisted.
- Invalid/missing/forged MACs, invalid capability encoding, and unbound
  attestation/artifact states return `verifier_failure` before any transport
  request. Candidate artifact parse failures retain `candidate_invalid` with
  the exact `artifact_invalid` reason code.
- The manual CLI now requires an execution capability-key argument and passes a
  lazy `createTransport` callback. It validates projection, artifact,
  attestation, and MAC before it constructs `createOpenAiResponsesTransport()`
  or reads `OPENAI_API_KEY`.
- Documentation records the trusted-Eval limitation and required pinned Bench
  provenance. The existing no-host-verifier-execution, symlink-ancestor,
  exact-five-key-response, Terra/Luna-only, and 50B nano-USD cap behavior is
  preserved.
- `.github/workflows/quality.yml` now runs `npm ci` before the existing
  deterministic typecheck and mixed `.mjs`/`.ts` test suite on pull requests and
  merge groups.

### Changed paths

- `.github/workflows/quality.yml`
- `README.md`
- `docs/quality-map.md`
- `docs/superpowers/plans/2026-08-12-pcda-judgment-entrypoint.md`
- `src/cli.ts`
- `src/judgment.ts`
- `tests/judgment.test.ts`
- `.superpowers/sdd/2026-08-12-pcda-judgment-entrypoint/progress.md`
- `.superpowers/sdd/2026-08-12-pcda-judgment-entrypoint/task-1-report.md`

### Verification

```sh
node --experimental-strip-types --test tests/judgment.test.ts
# RED before implementation: missing createAttestationMac export

npm run format
npm run format:check
node --experimental-strip-types --test \
  tests/judgment.test.ts tests/judge-panel.test.ts \
  tests/judge-campaign.test.ts tests/openai-judge.test.ts
# PASS: 29/29

npm ci
# PASS: 9 packages installed; audit reported 0 vulnerabilities

npm run typecheck
# PASS

npm test
# PASS: full deterministic suite

npm run check:inactive
# PASS: repository status not_active

node --test tests/inactive-boundary.test.mjs
# PASS

git diff --check
# PASS
```

All verification used deterministic fixtures/fake transports. No live provider
call was made and `.env.local` was not read. The repository remains
`not_active`; these checks are contract evidence only, not activation or a
measured benchmark result.

### Concerns

- The capability is intentionally trusted-caller scoped. Eval must generate and
  hold it outside the isolated candidate and must pin the exact merged Bench
  commit/bank digest; Bench cannot independently prove an operator-selected
  digest without extending the package trust boundary to Git/network state.
- A valid accepted attestation with no `OPENAI_API_KEY` still cannot run the
  manual panel. That expected operator configuration failure occurs only after
  preflight; malformed or forged attestations return `verifier_failure` even
  when no API key is available.

## Round 3 security-review fix

### Finding and TDD RED evidence

Round 2 passed the execution capability as a positional CLI argument. That put
the secret in the host process argument vector, where ordinary process
inspection or diagnostics could expose it. The trusted Eval caller must instead
inject it only into the host-side judge process after candidate shutdown; it
must never enter Harbor or the isolated candidate.

Before implementation, ran:

```sh
node --experimental-strip-types --test tests/judgment.test.ts
```

Expected RED was observed. The new real-child CLI regression supplied the
capability only as inherited `COFFEE_CHAT_EVAL_ATTESTATION_KEY`, with no
`OPENAI_API_KEY` and no positional capability. The old CLI returned `invalid`
because it still required a fourth positional value, rather than returning
`verifier_failure` for the deliberately missing attestation MAC.

### Repair

- The CLI grammar is restored to
  `judge <projection-root> <artifact> <isolated-verifier-attestation>`.
- Only the named inherited `COFFEE_CHAT_EVAL_ATTESTATION_KEY` carries the
  capability. `runJudge` copies it to a local variable, immediately deletes
  the `process.env` entry, and passes the local value only to `judgeProjection`.
  Missing values become the existing bounded invalid-capability
  `verifier_failure`; neither the value nor an argv echo reaches output/result.
- The child-process regression proves the normal judge argv contains no
  capability, the inherited entry is absent after CLI execution, the output and
  serialized result contain no capability, an invalid attestation returns
  `verifier_failure` before `OPENAI_API_KEY` transport construction, and a
  positional capability is rejected as invalid usage.
- `README.md`, the Quality Map, and the current Bench plan state the Eval host
  injection boundary: only after candidate shutdown, never Harbor/candidate.
  No evaluator-repository implementation was changed because Eval owns that
  launcher; the Bench public contract remains ready for that injection.
- The historical Task 1 brief is preserved and explicitly marked superseded at
  its old projected-`test.sh` and old CLI instructions, with pointers to the
  current plan and Round 2/3 evidence.

### Changed paths

- `src/cli.ts`
- `tests/judgment.test.ts`
- `README.md`
- `docs/quality-map.md`
- `docs/superpowers/plans/2026-08-12-pcda-judgment-entrypoint.md`
- `.superpowers/sdd/2026-08-12-pcda-judgment-entrypoint/task-1-brief.md`
- `.superpowers/sdd/2026-08-12-pcda-judgment-entrypoint/progress.md`
- `.superpowers/sdd/2026-08-12-pcda-judgment-entrypoint/task-1-report.md`

### Verification

```sh
node --experimental-strip-types --test tests/judgment.test.ts
# RED before implementation: inherited-only key produced CLI invalid usage

npm run format
npm run format:check
node --experimental-strip-types --test \
  tests/judgment.test.ts tests/judge-panel.test.ts \
  tests/judge-campaign.test.ts tests/openai-judge.test.ts
# PASS: 29/29

npm ci
npm run typecheck
npm test
npm run check:inactive
node --test tests/inactive-boundary.test.mjs
git diff --check
.githooks/pre-commit
```

Completed before commit:

```sh
npm ci
# PASS: 9 packages installed; audit reported 0 vulnerabilities

npm run typecheck
# PASS

npm test
# PASS: full deterministic suite

npm run check:inactive
# PASS: repository status not_active

node --test tests/inactive-boundary.test.mjs
# PASS

git diff --check
# PASS
```

All tests use deterministic fixtures/fake transports; no provider call is made
and `.env.local` is not read.

### Concerns

- The process environment is a narrower host-only transport than argv but is
  still within the trusted Eval operator boundary. Eval must inject it only
  after the candidate has stopped and avoid Harbor/candidate environment
  propagation. Bench intentionally does not claim protection from a malicious
  evaluator/operator.

## Round 4 critical security fix

### Finding and root cause

`src/cli.ts` still exposed `calibrate <projection-root> <artifact>`. That
public command executed `<projection-root>/harbor/tests/test.sh` with
`...process.env`, allowing caller-controlled projected shell bytes and host
credentials/capabilities to cross the Bench boundary. Separately, the retained
full-bank `calibrate-bank` batch inherited its complete host environment when
it launched trusted `harbor/calibrate.py`; that process imports the generated
verifier for each fresh projection.

The security invariant is now two-part:

- Bench has no public single-projection verifier-execution command; candidate
  verifier execution belongs to Eval/Harbor isolation.
- Bench may retain deterministic full-bank controls only from a fresh,
  validated empty workspace generated by trusted committed Bench code, and its
  verifier batch may receive only PATH and locale environment values.

### TDD RED evidence

Before implementation, ran:

```sh
node --experimental-strip-types --test \
  tests/tooling.test.ts tests/calibration.test.ts tests/projector.test.ts
```

Expected RED was observed:

- the policy test found `command === "calibrate"`, `runCalibration`, and the
  child-process import in CLI source; and
- a real `python3` wrapper around the full-bank calibration batch recorded the
  parent environment, including `OPENAI_API_KEY`,
  `COFFEE_CHAT_EVAL_ATTESTATION_KEY`, `HOST_AUTH_TOKEN`, and `PROVIDER_TOKEN`
  sentinels.

### Repair

- Removed `runCalibration`, its `spawnSync`/path imports, the `calibrate`
  branch, exit handling, usage text, and single-projection CLI behavior test.
  `calibrate` has no alias in the public CLI.
- Added a policy test over CLI source and current public usage documents. It
  rejects the removed command/path/import and asserts `runJudge` plus the lazy
  OpenAI transport is the only provider-capable CLI branch.
- Kept `calibrate-bank`: it still requires a fresh validated workspace,
  regenerates all 288 projections and their verifier inputs from trusted Bench
  code, and preserves its 864-control deterministic checks. Its `python3`
  launch now passes only explicit `PATH`, `LANG`, and `LC_ALL`; OpenAI, Eval
  capability, host-auth, provider, and all other parent environment entries are
  not inherited.
- Added a real full-bank subprocess probe that shadows `python3`, records the
  environment seen by `harbor/calibrate.py`, and then executes the trusted
  Python interpreter. Because that batch imports every generated verifier in
  the same process, the proof covers both the calibration subprocess and its
  generated verifier. macOS may add `__CF_USER_TEXT_ENCODING`; the test treats
  it as a platform locale key and rejects every other non-allowlisted key.
- README, Quality Map, and the current plan now state that calibration needing
  a candidate verifier belongs to Eval/Harbor isolation; the retained full-bank
  control path is trusted-Bench-only and environment-scrubbed.

### Changed paths

- `src/cli.ts`
- `src/calibration.ts`
- `tests/projector.test.ts`
- `tests/tooling.test.ts`
- `tests/calibration.test.ts`
- `README.md`
- `docs/quality-map.md`
- `docs/superpowers/plans/2026-08-12-pcda-judgment-entrypoint.md`
- `.superpowers/sdd/2026-08-12-pcda-judgment-entrypoint/progress.md`
- `.superpowers/sdd/2026-08-12-pcda-judgment-entrypoint/task-1-report.md`

### Verification

```sh
node --experimental-strip-types --test \
  tests/tooling.test.ts tests/calibration.test.ts tests/projector.test.ts
# RED before implementation: 18/20 passed; policy and environment-boundary
# regressions failed as expected.

node --experimental-strip-types --test \
  tests/tooling.test.ts tests/calibration.test.ts tests/projector.test.ts
npm run typecheck
# GREEN: 20/20 and typecheck passed.

npm ci
npm run format
npm run format:check
npm test
npm run check:inactive
node --test tests/inactive-boundary.test.mjs
git diff --check
.githooks/pre-commit
```

Completed before commit:

```sh
npm ci
# PASS: 9 packages installed; audit reported 0 vulnerabilities

npm run format
npm run format:check
npm run typecheck
# PASS

npm test
# PASS: full deterministic suite

npm run check:inactive
# PASS: repository status not_active

node --test tests/inactive-boundary.test.mjs
# PASS

git diff --check
# PASS
```

All tests use local deterministic fixtures and fake transports; no provider
call is made and no `.env` file is read.

### Concerns

- `calibrate-bank` is a deterministic trusted-Bench control check, not
  Eval/Harbor candidate isolation or benchmark activation. Its fresh-workspace
  and environment proof do not make a caller-provided projection safe to
  execute on the Bench host; that public path is removed.

## Round 5 critical security fix

### Finding and root cause

Even after removing the public single-projection CLI, full-bank calibration
constructed every batch request with a projection-derived `verifier` path and
`harbor/calibrate.py` imported that request field. A forged `verifier.py` in a
prepared projection could therefore become executable Python in the trusted
calibration batch.

The new invariant is exact: calibration requests may carry only JSON judgment
and artifact paths. The batch executable is always canonical
`harbor/verifier.py`, derived as the sibling of `harbor/calibrate.py` from
`__file__`; it is never selected by a request, projection, or caller path.

### TDD RED evidence

Before implementation, ran:

```sh
node --experimental-strip-types --test tests/calibration.test.ts
```

Expected RED was observed. The regression prepared a normal fresh full-bank
workspace, replaced `projections/000-none/harbor/tests/verifier.py` with a
marker-writing Python file, then ran calibration. The report became `invalid`
instead of `valid`, proving that the prior batch imported the forged projection
file.

### Repair

- Removed `verifier` from the TypeScript batch request contract and removed all
  batch reads of a projection's `verifier.py`. `CalibrationProjection` now
  retains only a JSON `judgmentPath` plus control artifact paths.
- `harbor/calibrate.py` derives `CANONICAL_VERIFIER` from its resolved
  `__file__` and loads that file for every request. Request objects no longer
  participate in executable-module selection.
- Made `calibrateProjectedBank` private. The retained
  `calibratePreparedBank` test seam accepts prepared data-only projections; it
  cannot pass an executable verifier path to the batch. Mutated artifact tests
  retain their safe behavior coverage.
- Added a forged-projection verifier regression. It proves the marker is not
  created and the normal calibration report remains `valid`.
- README, Quality Map, and the current plan now state that full-bank batches
  forward JSON data only and bind executable authority to the canonical sibling
  verifier.

### Changed paths

- `src/calibration.ts`
- `harbor/calibrate.py`
- `tests/calibration.test.ts`
- `README.md`
- `docs/quality-map.md`
- `docs/superpowers/plans/2026-08-12-pcda-judgment-entrypoint.md`
- `.superpowers/sdd/2026-08-12-pcda-judgment-entrypoint/progress.md`
- `.superpowers/sdd/2026-08-12-pcda-judgment-entrypoint/task-1-report.md`

### Verification

```sh
node --experimental-strip-types --test tests/calibration.test.ts
# RED before implementation: forged projection verifier made calibration invalid

node --experimental-strip-types --test \
  tests/calibration.test.ts tests/tooling.test.ts tests/projector.test.ts
npm run typecheck
# GREEN: 21/21 and typecheck passed.

npm ci
npm run format
npm run format:check
npm test
npm run check:inactive
node --test tests/inactive-boundary.test.mjs
git diff --check
.githooks/pre-commit
```

Completed before commit:

```sh
npm ci
# PASS: 9 packages installed; audit reported 0 vulnerabilities

npm run format
npm run format:check
npm run typecheck
# PASS

npm test
# PASS: full deterministic suite

npm run check:inactive
# PASS: repository status not_active

node --test tests/inactive-boundary.test.mjs
# PASS

git diff --check
# PASS
```

All checks use local deterministic fixtures/fake transports; no provider call
is made and no `.env` file is read.

### Concerns

- The canonical sibling verifier is trusted only to the extent that the checked
  out Bench source is trusted. This closes projection/request executable-path
  injection; it does not alter the documented trusted-operator boundary or
  turn full-bank calibration into candidate isolation.

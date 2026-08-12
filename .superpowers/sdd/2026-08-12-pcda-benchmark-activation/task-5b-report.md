# Task 5B report — two-model judge campaign boundary

## Outcome

Replaced the superseded three-model/six-vote judge contract with exactly
`gpt-5.6-terra` and `gpt-5.6-luna`. The repository remains `not_active`; these
deterministic fake-transport tests and public prospective contracts are not
provider execution, validity evidence, or a measured benchmark result.

## TDD evidence

Focused tests were written before the implementation changes.

Initial RED command:

```text
node --experimental-strip-types --test tests/openai-judge.test.ts tests/judge-panel.test.ts tests/judge-campaign.test.ts tests/validity.test.ts
```

The RED run failed for the expected missing/correctness reasons: no campaign
module or Responses transport export, the old Sol/Terra/Luna six-vote roster,
provider calls after deterministic failure, non-canonical response digests, and
incomplete validity/provenance checks. A final receipt-digest RED test then
failed because malformed receipts collapsed all sanitized bodies to one digest;
the corrected implementation preserves non-secret stable distinctions.

## Implemented contract

- The panel has one ordinary request per Terra/Luna slot, at most four requests
  after malformed-response retries, no third model, no fallback, no weighted
  score, and no tie-breaker.
- Deterministic-verifier failure returns before any transport call. Both slots
  must be valid; disagreement is a tie, and critical failure requires both
  critical votes with `pass: false`.
- Valid response digests contain only the five canonical QPCFR dimensions.
  Malformed-body digests remove secret-like and timestamp fields while retaining
  stable non-secret structure. Receipts contain no raw prompt, response,
  headers, or credential.
- The injected Responses API transport uses strict JSON Schema structured
  output and reads only `OPENAI_API_KEY`. All tests use fake transports.
- Campaign preflight requires exact atom count and independently declared input
  and output maxima. It reserves every sequential call, settles returned usage
  with integer nano-USD arithmetic, and stops on missing, malformed, or
  over-reservation usage. The hard cap is `50,000,000,000` nano-USD.
- Public config/schema record CalVer `2026.8.12`, the 2026-08-12 tariff
  snapshot, Terra input/output USD 2.00/12.00 per million tokens, Luna
  USD 0.20/1.20 per million tokens, and the source URL as provenance only.
- Activation validity now requires exact two-model reliability maps with
  positive denominators, exact required-strata map coverage, exactly two clean
  QPCFR values, and independent missing/invalid provenance checks for Bench,
  bank, Eval, receipts, judge config, and CalVer.

## Changed paths

- `src/openai-judge.ts`, `src/judge-panel.ts`, `src/judge-campaign.ts`,
  `src/validity.ts`
- `config/judges/2026.8.12.json`, `schemas/judge-campaign.schema.json`
- `tests/openai-judge.test.ts`, `tests/judge-panel.test.ts`,
  `tests/judge-campaign.test.ts`, `tests/validity.test.ts`
- `docs/superpowers/plans/2026-08-12-pcda-benchmark-activation.md`,
  `docs/superpowers/specs/2026-08-12-pcda-benchmark-design.md`,
  `docs/quality-map.md`, and `docs/validity/*.md`
- this report and `progress.md`

No `bank/**`, Product, Eval, or Harbor calibration path was modified.

## Final verification

Completed commands:

```text
npm run format
npm run format:check
node --experimental-strip-types --test tests/openai-judge.test.ts tests/judge-panel.test.ts tests/judge-campaign.test.ts tests/validity.test.ts
npm run typecheck
npm test
npm run check:inactive
node --test tests/inactive-boundary.test.mjs
git diff --check
```

Results:

- focused judge/cost/validity suite: `20 passed`, `0 failed`;
- `npm run typecheck`: passed;
- `npm run format:check`: passed after repository formatting;
- `npm test`: `113 passed`, `0 failed`;
- `npm run check:inactive`: passed with repository status `not_active`;
- `node --test tests/inactive-boundary.test.mjs`: `21 passed`, `0 failed`;
- `git diff --check`: passed.

The formatter reported every `bank/**` artifact unchanged. The final scoped
diff has no Product, Eval, bank, or Harbor calibration path.

## Fix round 1 — public config binding and stopped slots

### TDD evidence

The first focused RED run failed at module load because the campaign did not
export a public-config loader/parser. The added test also specified schema and
runtime rejection for complete-config mutations, receipt digests that change
with valid tariff provenance, and explicit `budget_stopped` votes for every
uncalled Terra/Luna slot after a usage failure.

### Corrected contract

- `src/judge-config.ts` loads the complete public
  `config/judges/2026.8.12.json`, validates it with the public schema, and
  parses the same complete semantic object strictly at runtime.
- Panel roster, retry limit, response format, campaign cap, planned reservation
  count, and tariff conversion now derive from that validated config. The
  `judgeConfigDigest` covers the canonical complete config and `tariffDigest`
  covers the complete tariff snapshot, including fetch date and source URL.
- Missing, malformed, or over-reservation usage returns a named cost stop. The
  current and every later uncalled slot receives a `budget_stopped` vote, so
  every affected panel remains `insufficient_votes` without another provider
  call.

### Verification

- focused judge/config/cost/validity suite: `22 passed`, `0 failed`;
- `npm run format:check`: passed;
- `npm run typecheck`: passed;
- `npm test`: `115 passed`, `0 failed`;
- `npm run check:inactive`: passed with repository status `not_active`;
- `node --test tests/inactive-boundary.test.mjs`: `21 passed`, `0 failed`;
- `git diff --check`: passed.

No provider call occurred. The final scoped diff touches only the public-config
runtime, judge/campaign behavior, validity roster consumer, focused tests,
quality map, and Task 5B evidence; it does not touch `bank/**`, Product, Eval,
or Harbor calibration. Fix-round commit:
`5da09d9ba9dd2ad49f829a40716a67062d5952d7`.

## Fix round 2 — execution-entry validation and public vote parity

The branch-wide review found that a typed caller could bypass the public judge
configuration at the campaign execution entry and that internal panel votes
had no canonical projection to the public judge-vote/result-state contract.
Tests first reproduced both gaps. The campaign now parses the complete config
before computing cost or calling a provider, so unapproved models or a raised
cap fail before transport. Structured responses now contain the five QPCFR
dimensions; a panel projects them to schema-valid public votes and maps ties to
`judge_disagreement` and insufficient panels to `judge_unavailable`.

The review also requested host-level isolation evidence. That evidence belongs
to Task 6 in Eval, not to a Bench source projection. The design and plan now
state explicitly that generated Harbor configuration and candidate-declared
access paths are not isolation proof. Eval must attest candidate-only mounts,
verifier-only judgment, single-artifact transfer, no network, and cleanup; a
missing or contradictory attestation is `host_failure`.

Verification after the fix: `npm run typecheck` passed and the full Node suite
passed `121/121`. Fix-round commit:
`e1de896462610188b380bb796157046f26117bed`. The independent re-review
returned `RESOLVED` and confirmed this branch is safe to publish only as a
`not_active` benchmark foundation. No provider call occurred.

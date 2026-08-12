# Task 5 implementation report

## Outcome

Implemented the deterministic six-request cross-model judge boundary and the
conjunctive activation-evidence evaluator. The repository remains `not_active`;
these contracts and fixture tests are not measured benchmark evidence.

## TDD evidence

Tests were created before production modules.

Command:

```text
node --experimental-strip-types --test tests/judge-panel.test.ts tests/validity.test.ts
```

Expected RED result: exit 1, 2 failed test files, 0 passed. Node reported
`ERR_MODULE_NOT_FOUND` for `src/judge-panel.ts` and `src/validity.ts`.

After implementation, the same targeted command passed 6 tests, failed 0.

## Implemented contract

- Exactly two requests each for `gpt-5.6-sol`, `gpt-5.6-terra`, and
  `gpt-5.6-luna` through an injected transport.
- Stable prompt/response/panel digests and explicit requested/resolved model,
  attempt count, malformed, provider-error, model-drift, and unavailable states.
- One retry for malformed structured output; no retry for valid negative votes.
- Four-of-six ordinary passage, explicit 3/3 tie and insufficient-vote states,
  two-of-six critical override, and deterministic-verifier override.
- Conjunctive activation floors with independently named checks and explicit
  missing, unavailable, invalid, and unmeasured outcomes.
- Prospective claims and public-bank contamination boundaries.

No live adapter or provider call was added. Tests use an injected fake
transport and no credential enters request or result provenance.

## Verification

- targeted judge/validity tests: 6 passed, 0 failed
- `npm run typecheck`: passed
- `npm run format:check`: passed
- `npm test`: 93 passed, 0 failed
- `npm run check:inactive`: passed; repository status `not_active`, 66 files checked
- `node --test tests/inactive-boundary.test.mjs`: passed (included as the final command in the successful verification chain)

## Files

- `src/openai-judge.ts`
- `src/judge-panel.ts`
- `src/validity.ts`
- `config/judges/2026.8.12.json`
- `tests/judge-panel.test.ts`
- `tests/validity.test.ts`
- `docs/validity/claims.md`
- `docs/validity/contamination.md`

No schema or package change was necessary.

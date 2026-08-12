# PCDA phase-network attestation correction

## Objective

Replace the false single-value `candidateNetwork=disabled` isolated-verifier
attestation claim with an exact phase-network contract compatible with Harbor
0.21 and a remote Codex model.

## Contract

- The task baseline remains `no-network`.
- Setup effective policy is `allowlist` with exactly
  `dl-cdn.alpinelinux.org` and `registry.npmjs.org`.
- Agent effective policy is `allowlist` with exactly `api.openai.com`.
- Separate verifier baseline and verifier phase are `no-network`.
- The attestation binds these fields inside its HMAC and public provenance.
- Unknown, missing, duplicate, reordered-as-semantic, or extra hosts fail closed.
- No public-network value is valid.
- Candidate inputs, transferred artifact, cleanup, projection/artifact binding,
  HMAC capability, closed reason codes, Terra/Luna roster, and cost cap remain
  unchanged.
- Bench validates attested execution evidence; Eval owns proving it from the
  actual Harbor result and network plan. Bench does not invent host evidence.

## Verification

- Write failing tests for the exact valid phase contract and every broader or
  missing policy.
- Update README/quality map and current judgment tests/fixtures.
- Run format, typecheck, all deterministic tests, inactive boundary, diff
  check, and pre-commit. No live provider call.

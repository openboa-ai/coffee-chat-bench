# Coffee Chat Bench repository rules

This repository is the official candidate-independent benchmark owner for Coffee
Chat. Its current repository status is `not_active`.

## Inactive boundary

- This trust base owns candidate-independent benchmark governance, experimental
  design and implementation, deferred activation criteria, and an executable
  no-claim boundary.
- Its status is `not_active`. It does not provide an active benchmark, measured results, a leaderboard, or Product-specific credit.
- The role-labelled roots `bank/`, `config/`, `docs/superpowers/`,
  `docs/validity/`, `harbor/`, `perspectives/`, `schemas/`, `src/`, and
  `tests/` may contain experimental design or implementation material. That
  material is not activation evidence, a measured result, or a performance
  claim.
- Candidate and Coffee Chat Product imports are forbidden from benchmark source.
  The benchmark exposes candidate-visible inputs and sealed judgments through a
  public contract only; it does not use Product internals for credit.
- Passing CI verifies governance and the inactive boundary only. It does not
  establish benchmark validity or activate the repository.
- The validity documentation may describe experimental construct and evidence
  design, but it may not establish an activation decision or measured claim.

## Change and security rules

- Every substantive change uses a pull request and squash merge.
- Human approval is not required. Sensitive paths require their applicable
  automated policy, security, and contract evidence before merge.
- Preserve explicit failure states. Do not turn missing, invalid, unavailable,
  or skipped evidence into success.
- Run `node scripts/check-inactive-boundary.mjs --root .` and
  `node --test tests/inactive-boundary.test.mjs` for changed surfaces. Do not
  weaken a check to imply activation.

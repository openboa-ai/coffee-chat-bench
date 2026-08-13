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

- Every substantive change uses a pull request and GitHub-native squash
  auto-merge. Before enabling auto-merge, run `npm run format:check`,
  `npm run typecheck`, `npm run check:inactive`, `npm test`, and
  `npm run ci:policy`.
- Mark whether the pull request changes a sensitive path: repository or
  workflow policy, `AGENTS.md`, `CODEOWNERS`, `SECURITY.md`, judge
  configuration or schema, external execution, resource bounds, canonical
  digests, sealed judgment, projection, or `harbor/**`. The exact list lives in
  `.github/merge-policy.json`; the external ruleset decides whether human review
  is required for those paths. Ordinary changes remain eligible for
  required-CI native auto-merge.
- Treat every current `src/**` module and `scripts/check-inactive-boundary.mjs`
  as a benchmark-integrity boundary: admission, calibration, materialization,
  metrics, validity, and inactive-state decisions are sensitive even when they
  do not call a provider or external process directly.
- Required CI installs the integrity-pinned parser under
  `.github/policy-parser` and runs structural policy before installing root
  dependencies. Treat its manifest, lockfile, checker, and workflow ordering as
  one sensitive bootstrap boundary.
- After a clean checkout, run `npm ci --ignore-scripts` for root dependencies;
  `npm test` and `npm run ci:policy` install the isolated parser through the
  exact `policy:install` command before loading the checker or fixtures.
- Root dependency updates stay on the GitHub-native path only when package
  names, exact versions, npm registry tarball identities, and sha512 lockfile
  integrities pass that protected policy.
- Do not create custom write-token merge automation or bypass the external
  ruleset's review decision.
- Routine Dependabot pull requests may use the same required-CI auto-merge
  path only when the actor, pull-request author, and head repository exactly
  match GitHub's in-repository Dependabot identity. Merge queue is disabled.
- Preserve explicit failure states. Do not turn missing, invalid, unavailable,
  or skipped evidence into success.
- Run `node scripts/check-inactive-boundary.mjs --root .` and
  `node --test tests/inactive-boundary.test.mjs` for changed surfaces. Do not
  weaken a check to imply activation.

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
  configuration or schema, executable quality input, external execution,
  resource bounds, canonical digests, sealed judgment, projection, or
  `harbor/**`. The exact list lives in `.github/merge-policy.json`; the
  central classifier sends those paths to the protected `coffee-security`
  Environment.
  Ordinary changes remain eligible for zero-review required-CI native
  auto-merge.
- Treat `package.json`, `package-lock.json`, `prettier.config.mjs`, and
  `tests/**` as executable quality inputs. Solo-maintainer OWNER/MEMBER changes
  to them require the protected Environment; only exact in-repository
  Dependabot package-only updates receive the central routine-maintenance
  exception after exact base policy succeeds.
- Treat every current `src/**` module and `scripts/check-inactive-boundary.mjs`
  as a benchmark-integrity boundary: admission, calibration, materialization,
  metrics, validity, and inactive-state decisions are sensitive even when they
  do not call a provider or external process directly.
- The target repository exposes one inert `pull_request_target` wrapper pinned
  to the reusable workflow in `openboa-ai/.github`. That central gate is the
  authorization boundary. It executes this base commit's checker and parser
  against the pull request as inert data. Candidate and local package scripts
  are post-trust quality checks only. Do not add another target workflow.
- On an author-controlled checkout, explicitly run `node
.github/policy-bootstrap.mjs && npm ci --ignore-scripts --prefix
.github/policy-parser` before `npm test` or `npm run ci:policy`; never use
  candidate bootstrap code to decide whether an untrusted branch is safe.
- Reject root `.npmrc`, parser `.npmrc`, and `npm-shrinkwrap.json`; they are
  unsupported competing install authorities.
- Root dependency updates stay on the GitHub-native path only when package
  names, exact versions, npm registry tarball identities, and sha512 lockfile
  integrities pass that protected policy.
- Do not create custom write-token merge automation or bypass the protected
  Environment's review decision.
- Routine Dependabot pull requests may use the same required-CI auto-merge
  path only when the actor, pull-request author, and head repository exactly
  match GitHub's in-repository Dependabot identity. Merge queue is disabled.
- Preserve explicit failure states. Do not turn missing, invalid, unavailable,
  or skipped evidence into success.
- Run `node scripts/check-inactive-boundary.mjs --root .` and
  `node --test tests/inactive-boundary.test.mjs` for changed surfaces. Do not
  weaken a check to imply activation.

# Coffee Chat Bench repository rules

This repository is the official candidate-independent benchmark owner for Coffee
Chat. Its current repository status is `not_active`.

## Inactive boundary

- This trust base owns candidate-independent benchmark governance, experimental
  design and implementation, deferred activation criteria, and an executable
  no-claim boundary.
- Its status is `not_active`. It does not provide an active benchmark, measured results, a leaderboard, or Product-specific credit.
- The roots `bank/`, `docs/`, `harbor/`, `qualification/`, `schemas/`, `src/`,
  and `tests/` may contain experimental design or implementation material. That
  material is not activation evidence, a measured result, or a performance
  claim.
- Candidate and Coffee Chat Product imports are forbidden from benchmark source.
  The benchmark exposes candidate-visible inputs and sealed judgments through a
  public contract only; it does not use Product internals for credit.
- The current bounded proposed construct is fixed synthetic judgment-policy
  application. It does not establish authentic-human transfer, population
  validity, or a complete personalized-alignment phenomenon. Target-conditioned
  alignment and task utility remain separate estimands. Deterministic checks may
  validate objective contracts, facts, constraints, provenance, state, and
  arithmetic; they must not award semantic alignment or task-utility credit.
- Before implementing a change, read `docs/benchmark-design.md` and apply its
  Benchmark-work gate. Work must define, measure, falsify, or establish
  validity for a candidate-independent construct and remain applicable to
  non-Coffee-Chat candidates. Product behavior belongs in Product tests;
  harness/provider behavior belongs in Eval.
- A model judge is a human-calibrated measurement instrument, not truth. No
  judge vote, panel agreement, fake/replay response, or deterministic control
  may enter an official score before the held-out human qualification and
  activation evidence pass.
- Official judging uses stateless dimension-specific pointwise calls and
  separately mirrored pairwise calls. Pointwise free rationale never enters a
  pairwise prompt. Pairwise inputs are blinded from candidate, harness, model,
  condition, target identity, and baseline direction.
- Numeric model judgment requires agreement from the two frozen primary judges,
  `gpt-5.6-terra` and `gpt-5.6-luna`, plus the independent cross-validation vote
  from `gpt-5.6-sol`. Sol never adjudicates a primary disagreement; any primary
  or cross-validation disagreement remains nonnumeric. All configured models
  require qualification against independently blinded human references before
  official score interpretation.
  Missing, abstained, inconsistent, unavailable, disagreeing, drift-invalid,
  or security-invalid judgments remain nonnumeric.
- Passing CI verifies governance and the inactive boundary only. It does not
  establish benchmark validity or activate the repository.
- The validity documentation may describe experimental construct and evidence
  design, but it may not establish an activation decision or measured claim.
- Before changing a construct, score interpretation, claim, case bank, judge
  policy, activation rule, or related-work statement, read
  `docs/benchmark-design.md`, `docs/implementation-plan.md`,
  `docs/validity/validity-argument-and-evidence-plan.md`, and
  `docs/validity/related-work-and-discriminant-validity.md`. Every nontrivial
  theoretical or empirical claim uses an adjacent admitted primary citation;
  project inference and design decision remain labeled as such.

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

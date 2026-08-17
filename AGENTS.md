# Coffee Chat Bench repository rules

This repository owns one candidate-independent public benchmark bank for agent
systems. Its status is `not_active`. The repository name is not a candidate
requirement and the bank must not import Coffee Chat product internals.

## Inactive boundary

- This repository does not provide an active benchmark, measured results, a
  leaderboard, or Product-specific credit.
- Passing tests proves contract and construction consistency only. It does not
  establish construct validity, human criterion validity, population validity,
  agent performance, or activation.
- The candidate class is an agent system: harness, configured model, host,
  tools, adaptation, and execution policy. A direct one-shot language-model
  completion is out of scope.
- The fixed synthetic construct is history-conditioned policy transfer: infer a
  case-specific judgment policy from eight records and apply it to a held-out
  task while preserving task performance and evidence grounding.
- The bank does not model a real person, a global personality trait, authentic
  human preferences, or Coffee Chat product behavior.
- Deterministic checks may validate objective contracts, facts, constraints,
  provenance, state, paths, and arithmetic. They must not award open-ended
  policy adherence or utility.
- The AI judge is the required semantic measurement layer. `provisional` means
  it can run for development before human criterion collection; `qualified`
  means the declared human-grounded evidence has been met. Human annotation is
  required for later reliability and calibration evidence, not for defining the
  judge interface.
- Missing, invalid, unavailable, skipped, abstained, or judge-disagreeing
  evidence remains nonnumeric and must not become zero or success.

## Data and ownership boundaries

- There is one externally selectable `public benchmark bank`.
- The fixed bank has 8 matched target pairs, 16 synthetic targets, 32 case
  families, three conditions per family, and 96 candidate projections.
- Candidate-visible manifests live under `bank/public/**`.
- Evaluator-only policy cards and criterion specifications live under
  `bank/evaluator/**`; they must not be copied into candidate task input.
- `bank/sampling-plan.json` is the canonical sampling matrix and
  `bank/bank.json` binds its digest to the 32 cases.
- `coffee-chat-eval` owns adapters, provider/model/host execution, Harbor
  orchestration, isolation evidence, and performance reports. This repository
  owns candidate-independent cases, rendering, objective artifact contracts,
  and benchmark validity evidence plans.
- `coffee-chat-bench` may use `persona` only when discussing source terminology
  in related work; it is not a product or benchmark identity claim.

## Benchmark-work gate

Before changing the case bank, criterion, rendering, evaluator boundary,
Harbor projection, or validity language, read:

- `docs/benchmark-design.md`;
- `docs/implementation-plan.md`;
- `docs/terminology.md`;
- `docs/validity/validity-argument-and-evidence-plan.md`;
- `docs/validity/related-work-and-discriminant-validity.md`.

Every benchmark change must define, measure, falsify, or validate a
candidate-independent construct. Product behavior belongs in product tests;
harness/provider behavior belongs in `coffee-chat-eval`.

## Construction and contract rules

- Keep the public surface to the single bank; do not reintroduce development,
  pilot, release, holdout, or judge-qualification datasets.
- Keep one case's task and evidence fixed across its three conditions. Render
  exactly one condition to a candidate.
- Keep target histories matched in situation, evidence IDs, format positions,
  and length. Do not expose policy names, target identity, hidden criterion, or
  held-out answers through candidate-visible text or IDs.
- Every evaluator criterion remains
  `authority: project_author_hypothesis` and `humanReviewed: false` until
  independently reviewed.
- Use research-standard terms such as policy adherence, policy transfer, task
  utility, evidence grounding, human criterion, reliability, calibration, and
  construct validity. Do not use `persona` as a synonym for the construct.
- `npm run data:audit` is the authoritative construction gate. Its JSON output
  must remain inspectable.
- Harbor projection must remain candidate-neutral, no-network, and exactly 96
  tasks. Structural reward is not a semantic benchmark result.
- Do not add candidate imports, provider credentials, dynamic loaders, or
  product-specific adapters to this repository.

## Change and security rules

- Every substantive change uses a pull request and GitHub-native squash
  auto-merge. Before enabling auto-merge, run `npm run format:check`,
  `npm run typecheck`, `npm run check:inactive`, `npm test`, and
  `npm run ci:policy`.
- Treat `AGENTS.md`, `CODEOWNERS`, `.github/**`, `package.json`,
  `package-lock.json`, `tests/**`, `src/**`, `harbor/**`, canonical digests,
  evaluator material, and inactive-state logic as sensitive paths. The exact
  repository policy is in `.github/merge-policy.json`.
- Do not create custom write-token merge automation or bypass protected review
  environments.
- On an author-controlled checkout, run
  `node .github/policy-bootstrap.mjs && npm ci --ignore-scripts --prefix
.github/policy-parser` before `npm test` or `npm run ci:policy`.
- Reject root `.npmrc`, parser `.npmrc`, and `npm-shrinkwrap.json` as competing
  install authorities.
- Preserve explicit failure states. Never weaken an inactive check to imply
  activation.

## Required verification

```bash
npm run data:audit
npm run format:check
npm run typecheck
npm run check:inactive
npm test
npm run ci:policy
git diff --check
```

Run `node scripts/check-inactive-boundary.mjs --root .` and
`node --test tests/inactive-boundary.test.mjs` for changed surfaces.

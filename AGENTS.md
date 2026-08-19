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
- The research area is personalized alignment. The fixed operational estimand
  is target-conditioned judgment alignment: infer a context-dependent judgment
  pattern from eight records, apply it to a held-out task, distinguish matched
  targets, and preserve task performance and evidence grounding.
- The bank does not model a real person, a global personality trait, authentic
  human preferences, or Coffee Chat product behavior.
- Deterministic checks may validate objective contracts, facts, constraints,
  provenance, state, paths, and arithmetic. They must not award open-ended
  judgment alignment or task performance.
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
- Candidate-visible, self-contained manifests live under `bank/public/**`.
- Human-audit construction annotations live under `bank/annotations/**`; they
  are not rendered to candidates and are not an evaluator answer key.
- There is no `bank/evaluator/**` directory in the public bank.
- `bank/sampling-plan.json` is the canonical sampling matrix and
  `bank/bank.json` binds its digest to the 32 cases.
- `coffee-chat-eval` owns adapters, provider/model/host execution, Harbor
  orchestration, isolation evidence, and performance reports. This repository
  owns candidate-independent cases, rendering, objective artifact contracts,
  provider-neutral Judge requests/parsing, submission evaluation, and benchmark
  validity evidence plans. It does not generate candidate output or execute an
  agent.
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
- Keep one case's task and document bundle fixed across its three conditions. Render
  exactly one condition to a candidate.
- Keep target histories matched in situation, evidence IDs, format positions,
  and length. Do not expose construction labels, target identity, reference
  labels, or held-out answers through candidate-visible text or IDs.
- Keep qualification outputs, reference labels, and Judge results out of the
  public input bank. The frozen synthetic output corpus lives under
  `qualification/corpus/**` and currently contains 48 family variants, 144
  submissions, and 144 pointwise references. Its references are
  `model_authored_draft` records pending project-owner review; pairwise labels
  and Judge results are not yet present.
- Use the terminology map. Prefer personalized alignment, judgment alignment,
  stated rationale, task performance, evidence grounding, human criterion,
  reliability, calibration, and construct validity. Do not use `persona` as a
  synonym for the construct.
- Every candidate submission contains a final artifact and structured stated
  decision record. The record is never described as hidden chain-of-thought and
  cannot compensate for deficient artifact-level performance.
- Keep pointwise dimensions independent. Keep family evidence as four mirrored
  pairwise comparisons; order inconsistency remains nonnumeric. Do not restore
  an arbitrary `transferred` threshold or universal composite score.
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
  annotation data, and inactive-state logic as sensitive paths. The exact
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

# Agent Benchmark Quality PR Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the agent-only benchmark in reviewable PR-sized units so that its public explanation, case bank, and AI-judge measurement instrument can each be inspected and verified without mixing their responsibilities.

**Architecture:** Keep three boundaries separate: public documentation explains the current bank; the bank owns candidate-independent cases, controls, and provenance; and the evaluator owns semantic AI-judge measurement and its evidence state. A later cross-repository PR connects the stabilized Bench contract to `coffee-chat-eval`'s agent adapter and Harbor execution. No PR activates the benchmark or claims general agent performance.

**Tech Stack:** Markdown, JSON case manifests, TypeScript contracts and judge logic, Node test runner, Ajv JSON Schema validation, Prettier, and Harbor task projection.

## Global Constraints

- Scored candidates are agent systems only; direct one-shot language-model completions are out of scope.
- `candidateKind: "agent"` remains required in the candidate contract and receipt.
- The public surface is one `public benchmark bank`; release and form labels are internal reporting strata, not user-selectable datasets.
- `coffee-chat-bench` remains candidate-independent and must not import Coffee Chat or award product-specific credit.
- Objective validators may enforce structure, provenance, citations, constraints, and arithmetic; they may not award semantic policy alignment or utility.
- AI judging is required for semantic dimensions. `provisional` measurements may guide internal hill climbing; `qualified` interpretation requires the future human-criterion evidence.
- Missing, invalid, unavailable, failed, abstained, disagreeing, leaked, and cleanup-failed states remain explicit and nonnumeric.
- The repository remains `not_active`; passing tests, a dry run, or a provisional report cannot activate it.
- CalVer remains the only version identity. Do not add semver, compatibility layers, or a second benchmark-version axis.
- Every PR contains one objective, observable acceptance criteria, failure modes, oracle, changed owner boundary, and verification commands; merge history uses one squash commit per PR.

## Baseline

The current bank contains 12 scored families and 60 candidate conditions, plus
four judge-qualification families that do not enter candidate scoring. The
latest scope commit (`10bbbc0`) changed the candidate contract and public
wording but did not change `bank/**`. The current bank is synthetic,
prospective, and not yet supported by independent human annotation, qualified
judge evidence, or an activation decision.

## PR sequence

| Order | PR objective                                                         | Owning surface                                               | Depends on                              | Result                                                                               |
| ----- | -------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------ |
| 1     | Reader-facing README and navigation reset                            | README and plan/docs routing                                 | Current agent-only baseline             | A developer can understand the benchmark without reading the research appendix first |
| 2     | Dataset admission rules, case-quality repair, and coverage expansion | Bank content and data-quality evidence                       | PR 1                                    | The public bank is larger, balanced, and governed by an auditable case oracle        |
| 3     | AI-judge/evaluator measurement hardening                             | Judge protocol, qualification, reports, and replay tests     | PR 1; may run in parallel with PR 2     | Provisional semantic measurement is robustly bounded without provider calls in CI    |
| 4     | Agent execution integration                                          | `coffee-chat-eval` adapter, Harbor, and one manual Codex run | PR 2 and PR 3                           | One real agent trial produces inspectable receipts without activating the benchmark  |
| 5     | Human criterion and activation evidence                              | Qualification evidence and activation audit                  | PR 4 plus external annotation resources | Deferred validity work; not part of the first implementation wave                    |

PR 2 and PR 3 can be developed in parallel after PR 1 because they own
different files and have different oracles. PR 4 waits for both the final bank
contract and the final judge contract. The release strata are not separate PR
products or public datasets; the dataset work is one coherent bank PR.

---

## PR 1: README and public navigation reset

**Title:** `docs(bench): make the agent benchmark readable`

**Objective:** Make the repository understandable from the perspective of a
developer who wants to evaluate an agent: what is measured, what the input
looks like, what the current bank contains, what is not claimed, and where the
deeper validity argument lives.

**Files:**

- Modify: `README.md`
- Create: `docs/terminology.md`
- Modify: `docs/implementation-plan.md`
- Do not modify: `bank/**`, `src/**`, `schemas/**`, or evaluator code

**README structure:**

1. What the benchmark measures
2. Candidate scope: agent systems only
3. What one case contains and what the candidate sees
4. Current bank census, linked to `DATA-CARD.md`
5. AI-judge evidence states
6. Current `not_active` status and limitations
7. Commands and links to deeper documents

The README must use standard terms such as `agent system`, `agent runtime`,
`harness`, `candidate-visible input`, `sealed evaluator material`, `AI judge`,
`LLM-as-a-judge`, `human criterion`, `reliability`, `calibration`,
`personalization`, `personalized alignment`, `profile-conditioned generation`,
`preference alignment`, and `dynamic preference inference`. The terminology
document must label `context-conditioned decision behavior` as this project's
operational label rather than an established field-wide term. Neither document
may describe Coffee Chat as a candidate or imply that a passing repository test
proves benchmark validity.

**Acceptance oracle:** A reader can answer the seven questions above from the
README and linked documents; every link resolves to a repository file; the
README contains no stale one-shot-candidate or Coffee-Chat-comparison claim;
and the `not_active` boundary remains explicit.

**Checks:**

- `npm run format:check`
- `npm run check:inactive`
- `npm test`
- manual link and wording review recorded in the PR description

---

## PR 2: Dataset admission, quality repair, and coverage expansion

**Title:** `data(bench): strengthen public bank coverage and case quality`

**Objective:** Improve the bank as a benchmark dataset, not merely increase
the file count. Every added or revised case must represent the declared
construct, survive candidate-visible leakage review, and have a defensible
semantic contrast.

**Files:**

- Modify: `bank/bank.json`
- Create or modify: `bank/cases/ccbench-ra-*.json` and `bank/cases/ccbench-rb-*.json`
- Create or modify: matching `bank/evaluator/plans/ccbench-*.json`
- Create or modify: matching `bank/evaluator/rubrics/ccbench-*.json`
- Modify: `README.md`, `DATA-CARD.md`, `docs/implementation-plan.md`,
  `docs/quality-map.md`,
  `docs/validity/bank-development-review.md`, `OVERLAP-REPORT.json`
- Modify: `tests/public-bank.test.ts`, `tests/harbor-projection.test.ts`
- Do not modify: AI-judge transport, provider configuration, or evaluator
  semantics

**Coverage target:** Preserve the existing 12 scored families and add one
independent family for each policy-block × output-form × reporting-stratum
cell. This produces 24 scored families and 120 candidate conditions, with two
independent families in every cell. The target is a balanced coverage floor for
this fixed pilot, not evidence of population validity or statistical
generalization. `release_a` and `release_b` remain internal strata inside one
public bank.

**Case admission checklist:**

- both policy sides are defensible from the supplied evidence;
- the policy sides require an incompatible present decision rather than a
  hybrid answer that satisfies both;
- diagnostic and nondiagnostic contexts are exposure-matched and do not state
  the held-out answer;
- task, evidence, output contract, provenance, rubric, and judgment plan are
  internally consistent;
- candidate-visible rendering excludes target identity, expected direction,
  rubric projections, and judgment plans;
- lineage and source identifiers do not duplicate another family;
- lexical-surface, style, verbosity, and retrieval shortcuts are recorded as
  review risks, not treated as semantic scores;
- all content has an explicit MIT/synthetic provenance declaration.

**Acceptance oracle:** Bank validation passes with the updated 24-family / 120-
condition scored census; every case has exactly five conditions and valid
sealed digests; Harbor projection has the corresponding condition count; the
data card, README link target, and bank manifest agree; and no candidate score
or activation claim is added.

**Checks:**

- `npm test`
- `npm run typecheck`
- `npm run check:inactive`
- `npm run format:check`
- `git diff --check`
- a focused human/agent case review attached to the PR, with every rejected
  case and its failure mode recorded rather than silently removed

---

## PR 3: AI-judge/evaluator measurement hardening

**Title:** `feat(bench): harden provisional semantic measurement`

**Objective:** Improve the evaluator as a measurement instrument. This PR does
not evaluate Coffee Chat and does not add an agent adapter; it makes the fixed
AI-judge protocol reliable enough to produce explicit provisional development
measurements for any eligible agent receipt.

**Files:**

- Modify: `src/judge.ts`, `src/benchmark-contracts.ts`, `src/metrics.ts`, and
  only the related contract modules that are necessary for the judge boundary
- Modify: `qualification/PROTOCOL.md`, `qualification/README.md`,
  `qualification/RELIABILITY.md`, and the judge sections of
  `docs/benchmark-design.md` and `docs/validity/validity-argument-and-evidence-plan.md`
- Modify: `tests/judge.test.ts`, `tests/report.test.ts`,
  `tests/contracts.test.ts`, and the smallest representative replay fixture

**Measurement rules:**

- keep the same fixed primary panel and cross-validation judge unless a
  separately documented protocol decision changes them;
- keep candidate, harness, model, host, and condition out of the blind judge
  payload;
- parse only the declared structured verdict for the current dimension and
  mode;
- preserve provider failure, invalid response, unavailable model, abstention,
  primary disagreement, cross-validation disagreement, and qualification
  absence as explicit nonnumeric outcomes;
- allow `provisional` configurations without human annotations;
- require independently bound human-criterion evidence for `qualified`;
- record protocol, study, rubric, prompt, judge evidence state, and resolved
  model digests in every judgment/report;
- use replay/fake transports in PR CI; real credentials and providers remain
  outside the Bench PR lane.

**Acceptance oracle:** A provisional configuration can measure a valid replay
case; a qualified configuration cannot be created without the required human
evidence; canonical/mirrored pair order cannot silently change a measured
verdict; every failure state remains nonnumeric; and no candidate-independent
benchmark score is invented from a missing judge result.

**Checks:**

- focused judge/report/qualification tests
- `npm test`
- `npm run typecheck`
- `npm run check:inactive`
- `npm run ci:policy`
- `npm run format:check`

---

## PR 4: Agent execution integration in `coffee-chat-eval`

**Title:** `feat(eval): run the first isolated agent benchmark trial`

This is a separate repository PR. It starts only after PR 2 and PR 3 are
merged. It owns the agent adapter, Harbor execution, credentials, host
isolation, session order, leakage checks, cleanup evidence, and candidate
receipt assembly. It must not add provider transport to Bench or reinterpret
the AI judge as a candidate.

The first vertical slice uses one pinned Bench commit, one case, one agent
harness, one allowed Codex model, one isolated Harbor host, and one
repetition. It must produce a complete receipt with explicit candidate,
host, verifier, invalid, skipped, and unavailable states. The trial is
execution evidence only; it does not activate the Bench or support a general
performance claim.

---

## Deferred PR 5: Human criterion and activation evidence

Human annotation remains a required future validity step, not a prerequisite
for the provisional judge implementation. This later PR collects blinded
human criterion labels, measures agreement/reliability/calibration and
disagreement, requalifies the fixed judge panel, and runs the activation audit.
It must preserve the current `not_active` state if any evidence gate is
missing. No current PR may silently replace this work with owner review or
model agreement.

## PR description template

Every PR in this series uses this structure:

```markdown
## Objective

## Acceptance criteria

## Observable oracle and representative checks

## Failure modes and forbidden side effects

## Owned repository and cross-repository impact

## Candidate / evaluator / benchmark boundary

## Verification commands and results

## Provenance, CalVer, and activation impact
```

## Self-review

- README, bank content, and AI judge have separate owning PRs.
- Dataset expansion is balanced by policy block, form, and reporting stratum;
  it is not an arbitrary count increase.
- Qualification material remains separate from scored candidate cases.
- The AI judge is mandatory for semantic measurement but its evidence state is
  separate from human criterion validity.
- The first real agent run is not hidden inside Bench CI.
- No PR changes the repository to `active` or creates a product-specific
  Coffee Chat score.

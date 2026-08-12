# PCDA benchmark activation plan

**Goal:** Create a public, MIT-licensed, candidate-independent synthetic PCDA
benchmark and evaluate task-only/direct-context baselines through an exact Bench
commit without changing Coffee Chat Product behavior.

**Architecture:** Bench owns the source bank, candidate-visible projection,
runtime-isolated judgment, QPCFR design, and validity evidence. Eval later
consumes the public Bench interface and records explicit outcome states. Local
CI remains deterministic and makes no provider/model calls.

**Global constraints:** The construct is synthetic PCDA on the fixed public
bank; no real-person understanding, realized utility, or unseen-task
generalization claim is allowed. Candidate-visible files and judgment/verifier
files remain in separate Harbor environments. QPCFR is conjunctive, while
reliability and efficiency are reported separately. All public source and
documentation are MIT-licensed. CalVer `2026.8.12` is the only release
identity. Product implementation and a Coffee Chat `CC` condition are out of
scope. Measurement scope and activation criteria are derived independently of
available API funds. The current USD 50 runner cap is an operational profile
for individually authorized executions and never licenses a smaller sample,
fewer controls, weaker statistical evidence, or an activation claim from an
incomplete campaign.

## Task sequence

### Task 1: Project the confirmed design and validation-state boundary

Create the canonical PCDA design and this activation plan. Permit the declared
experimental role roots while status is `not_active`; reject active status,
measured results, leaderboards, Product-specific credit, unlabelled measurement
artifacts, and candidate/Product-specific source imports. Verify with failing
fixture tests followed by the checker and complete Node suite.

### Task 2: Implement public contracts and non-compensatory metrics

Create public schemas for cases, decision manifests, judge votes, verdicts, and
reports, plus contract parsing, stable identity, qualification, family
qualification, and aggregation modules. Preserve every explicit state and use
macro QPCFR by domain and operation without a universal weighted score. Start
with literal valid/malformed fixtures and state, invariant, critical-failure,
and unmeasured-denominator tests.

### Task 3: Implement source-bank validation and Harbor projection

Create bank validation, task projection, and a CLI. Project candidate inputs to
one Harbor environment and judgment/oracle/verifier inputs to another. Verify
real fixture artifacts: Oracle passes while no-op, list-all, echo, malformed,
and attempted judgment-file access fail. Candidate network mode remains
disabled and generated output is temporary and reproducible from source
digests.

### Task 4: Author and admit the public source bank

Create development, calibration, release, and bridge bank partitions plus
contrasting perspectives, admission checks, content blueprint, and admission
ledger. The planned partition has 96 families: development 24, calibration 24,
release 40, and bridge 8, balanced across three domains, four operations, two
difficulties, and four cases. Admit only material that passes underdetermination,
counterfactual, locality, invariance, anti-echo, rights, provenance, and
deterministic Oracle/control checks.

### Task 5: Implement cross-model judging and validity methods

Create structured judge transport, panel aggregation, validity evaluation, and
the public judge configuration. Preserve request/resolved model IDs and
prompt/response digests, distinguish ties and provider drift, and permit only a
single malformed-response retry. The live roster is exactly Terra and Luna:
one ordinary request per model, at most four calls per atom, no fallback or
tie-breaker, and deterministic-verifier failure before a provider call. A
campaign preflights its declared atom count and per-request token maxima against
the current operator-authorized integer-nano-USD execution cap, reserves before
each call, and stops on missing, malformed, or over-reservation usage. The
`2026.8.12` implementation profile sets that cap to USD 50; it is not a
benchmark-design constant or activation threshold. CI uses complete fake
transports; manual execution reads only `OPENAI_API_KEY` without exposing it.

### Task 6: Consume Bench from Eval and run baseline E2E

In the separately owned Eval repository, consume an exact Bench commit and bank
digest, run only T0, T1-A, and T1-B through Harbor and Codex, and keep the Bench
verifier authoritative. Record cleanup and provenance and retain all explicit
candidate, host, verifier, judge, skipped, unavailable, and unmeasured states.
The E2E must attest the resolved Harbor host boundary: only candidate inputs are
mounted for the agent, judgment remains verifier-only, only the declared output
artifact crosses the boundary, candidate network is disabled, and cleanup is
recorded. Candidate-declared access logs are not isolation proof.
This task is outside the Bench repository boundary until the public Bench
interface exists.

### Task 7: Activation decision and handoff

Only after every activation gate has complete evidence, create the activation
decision and validity report, change the status from `not_active`, and update
the workspace handoff. Do not activate for missing, unavailable, intended, or
unmeasured evidence.

## Execution rule

Each implementation task follows test-first development: write a behavior test,
record its expected failure, make the smallest implementation change, rerun the
targeted test, then run the complete relevant deterministic suite. Each task
receives an independent review before the next task expands the design.

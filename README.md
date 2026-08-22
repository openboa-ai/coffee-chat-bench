# Coffee Chat Bench

Coffee Chat Bench is a candidate-independent benchmark for **agent systems**.
It studies a problem within personalized alignment: whether an agent can infer
a target's context-dependent judgment pattern from prior decisions and apply
it to a new task without sacrificing task performance or evidence grounding.

The operational estimand is **target-conditioned judgment alignment**:

> For the same task and evidence, how does conditioning an agent on one target's
> decision history change its judgment, and does the resulting artifact align
> more closely with that target than with a matched alternative?

The repository name is a project name, not a candidate requirement. Any agent
system that implements the public input/submission contract can be evaluated.
Coffee Chat is one possible consumer. Direct one-shot language-model
completions are outside the candidate scope.

## What the benchmark contains

There is one externally selectable dataset: the `public benchmark bank`.

| Unit                              |                                               Count |
| --------------------------------- | --------------------------------------------------: |
| Matched target pairs              |                                                   8 |
| Synthetic targets                 |                                                  16 |
| Prior decision records per target |                                                   8 |
| Public case families              |                                                  32 |
| Conditions per case               |                                                   3 |
| Agent-condition projections       |                                                  96 |
| Domains                           |                                     8, 4 cases each |
| Forms                             |                            16 dialogue, 16 artifact |
| Transfer types                    | 8 each: near, far, boundary condition, cue conflict |
| Documents                         |                               5 per case, 160 total |

Each case combines a realistic task, five documents, explicit deliverables and
hard constraints, and one of three conditions:

```text
unconditioned -> task + documents
target_a      -> task + documents + target A decision history
target_b      -> task + documents + target B decision history
```

Target A and B receive the same historical situations and evidence but make
different, defensible judgments in six records. They converge in two records
where a shared hard constraint dominates. The held-out task never exposes a
target label, answer key, evaluator rubric, or the other target's history.

The bank is synthetic and public. It does not claim to reconstruct a real
person, measure a personality trait, or generalize to all human preferences.

## Input and submission contract

This repository never runs a candidate agent or generates its answer. A caller
renders one condition, runs an external agent, and returns one submission:

```text
CandidateSubmission
├── artifact                final text delivered to the user or workspace
└── decisionRecord          concise stated rationale
    ├── decision
    ├── evidenceUse[]       visible document/history IDs and their use
    ├── tradeoffs[]         paired factors and their resolution
    ├── constraints[]       constraint handling
    └── uncertainty
```

The decision record is observable diagnostic evidence. It is not hidden
chain-of-thought, and it cannot compensate for a poor final artifact. It may
reference only sources visible in that candidate condition.

Harbor projects this contract as `/workspace/artifact.txt` plus
`/workspace/decision-record.json`. Objective verification checks UTF-8,
bounded files, required references, JSON shape, and visible source IDs. It does
not award semantic credit.

The library boundary is intentionally small:

```text
getBenchmarkInput(case, condition)
  -> candidate-visible task

evaluateSubmission(input, submission, judgeTransport)
  -> objective validation + pointwise semantic measurements

evaluateCaseFamily(case, three submissions, judgeTransport)
  -> pointwise measurements + mirrored pairwise evidence
```

`JudgeTransport` is provider-neutral. Provider SDKs, credentials, retries,
candidate execution, host isolation, receipts, and cross-candidate reporting
belong outside this repository.

## What is measured

Pointwise AI-judge calls are dimension-specific:

| Dimension                    | Result                 | Uses the decision record? |
| ---------------------------- | ---------------------- | ------------------------: |
| `judgment_alignment`         | 1–5                    |                        no |
| `stated_rationale_alignment` | four 1–5 facets        |                       yes |
| `task_performance`           | 1–5                    |                        no |
| `evidence_grounding`         | 1–5                    |                        no |
| `hard_constraint_violation`  | true / false / abstain |                        no |

The stated-rationale facets are `cue_utilization`, `cue_weighting`,
`context_sensitivity`, and `action_consistency`. The first two dimensions are
`not_applicable` for `unconditioned` because no target history is supplied.

Case-family evaluation adds four pairwise comparisons:

1. target-A artifact versus unconditioned artifact under target-A history;
2. target-B artifact versus unconditioned artifact under target-B history;
3. target-A artifact versus target-B artifact under target-A history;
4. target-B artifact versus target-A artifact under target-B history.

Each comparison runs in canonical and reversed presentation order. If the
semantic winner changes after reversal, the result is `order_inconsistent`
rather than a number. Pairwise prompts receive final artifacts only; they never
receive decision records or condition identities.

The evaluator reports conditioning effects, target specificity, boundary
convergence, pointwise dimensions, and explicit failure states. It does **not**
collapse them into a universal score or `transferred`/`not_transferred` verdict.

## Current status

Repository status: `not_active`.

The current implementation establishes an inspectable input bank, evaluator
contract, and frozen 144-submission synthetic Judge-development corpus. The
corpus has 48 family variants and 144 pointwise `project_owner_reference`
records from project-owner construction review. It has no pairwise reference
labels or qualified human criterion. A Luna-only provisional hill-climbing
campaign has been completed against this frozen corpus; its detailed result is
recorded in [Provisional AI Judge Hill-Climbing Results](qualification/HILL-CLIMBING-RESULTS.md).
The 24 added stress submissions and the 13 rewritten submissions are bound to
the same public case manifests; construction intent is kept in a sidecar and
is not part of Judge-facing input. These records do not establish construct
validity, human agreement, AI-judge reliability, population validity, agent
performance, an active benchmark score, or a leaderboard.

This does not establish benchmark validity, authentic-human transfer,
population validity, or product performance.

The AI judge is a required semantic measurement instrument. It can run in a
`provisional` evidence state before human annotation exists; this means the
measurement is usable for development but not yet validated against a genuine
human criterion. Future blinded human annotation is required to assess and
calibrate judge agreement. Project-owner data review is construction QA, not
independent human criterion evidence.

The qualification campaign binds one fixed 624-call full-matrix measurement
plan and an all-metric gate policy covering ordinal agreement, binary
hard-constraint detection, result completeness, latency, and output length.
The 100 budgeted Full iterations and 181 indexed diagnostic mini records are
closed and preserved. No Full iteration passed the all-metric gate, so no
prompt was accepted. Historical Luna steps made under earlier routing plans
remain immutable evidence and are not mixed into the current full-matrix
progress series. The compact campaign metadata is tracked in Git; repeated raw
prompts, responses, attempts, labels, and plots are preserved in immutable
Release assets bound by the [campaign evidence manifest](qualification/hill-climbing/evidence-manifest.json).

## Repository ownership

```text
bank/public/cases/       candidate-visible case manifests
bank/annotations/        construction-review sidecars, never candidate input
bank/bank.json           canonical bank index and digest
bank/sampling-plan.json  fixed sampling matrix
harbor/                  candidate-neutral execution projection
src/                     contracts, rendering, validation, and evaluator
qualification/           frozen Judge-validation outputs and future labels
docs/                    design and validity boundaries
```

`coffee-chat-bench` owns cases, submission validation, Judge prompts/parsing,
semantic evaluation, and validity evidence. `coffee-chat-eval` owns candidate
adapters, agent/model/host execution, isolation evidence, receipts, and
performance reports. Neither repository may infer benchmark credit from
Coffee Chat internals.

## Run the deterministic gates

```bash
npm ci
npm run data:audit
node --experimental-strip-types scripts/qualification-audit.mjs qualification/corpus bank
npm run format:check
npm run typecheck
npm run check:inactive
npm test
npm run ci:policy
git diff --check
```

These checks do not call a provider, run a candidate, or activate a benchmark.

## Read next

- [Data card](DATA-CARD.md) — bank composition, provenance, and limitations
- [Benchmark design](docs/benchmark-design.md) — estimand and measurement model
- [Terminology map](docs/terminology.md) — research terms and local contracts
- [Preregistration](PREREGISTRATION.md) — fixed comparisons and falsifiers
- [Validity evidence plan](docs/validity/validity-argument-and-evidence-plan.md)
- [Harbor projection](harbor/README.md)
- [Judge qualification data](qualification/README.md)
- [Provisional AI Judge hill-climbing results](qualification/HILL-CLIMBING-RESULTS.md)

## Research basis

- [A Survey on Personalized Alignment (Findings of ACL 2025)](https://aclanthology.org/2025.findings-acl.277/)
- [LaMP: When Large Language Models Meet Personalization (ACL 2024)](https://aclanthology.org/2024.acl-long.399/)
- [Learning Personalized Alignment for Evaluating Open-ended Text Generation (EMNLP 2024)](https://aclanthology.org/2024.emnlp-main.737/)
- [AgentBench: Evaluating LLMs as Agents (ICLR 2024)](https://arxiv.org/abs/2308.03688)
- [BetterBench (NeurIPS 2024 Datasets and Benchmarks Track)](https://proceedings.neurips.cc/paper_files/paper/2024/hash/26889e8359e7ef8a7f5d77457364ca55-Abstract-Datasets_and_Benchmarks_Track.html)
- [Terminal-Bench](https://www.tbench.ai/) and [Harbor](https://www.harborframework.com/docs/tasks)

## License

Repository software and benchmark material are MIT licensed. Report security
issues according to [SECURITY.md](SECURITY.md).

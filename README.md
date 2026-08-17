# Coffee Chat Bench

Coffee Chat Bench is a candidate-independent benchmark for **agent systems**.
It asks whether an agent can infer a stable decision policy from a target's
synthetic judgment history and transfer that policy to a held-out task while
preserving task performance and evidence grounding.

The repository name is a project name, not a candidate requirement. The bank
does not import Coffee Chat, require its plugin, or award product-specific
credit. Any agent harness that implements the input/output contract can be a
candidate. A direct one-shot language-model completion is outside the candidate
scope.

## What is evaluated?

Each case holds the task and evidence packet constant and varies only the
history supplied to the agent:

- `unconditioned` — task and evidence, without a judgment history;
- `target_a` — the same task and evidence plus one synthetic target's history;
- `target_b` — the same task and evidence plus the matched target's history.

The agent must use the selected history when it is relevant, transfer the
resulting decision policy to a new task, and still satisfy the task contract.
The benchmark is about history-conditioned policy transfer in agents. It does
not claim to model a real person, a global personality trait, or authentic
human preferences.

## How one case runs

```text
public case + selected condition
        -> candidate adapter and isolated agent run
        -> objective artifact verifier
        -> AI judge for open-ended semantic dimensions
        -> evaluation report owned by coffee-chat-eval
```

The public case contains the task, evidence, output contract, and both target
histories. The runtime renderer gives an agent only one selected history; it
does not expose the other target, the hidden policy, or the evaluator criterion.
The evaluator material is stored separately under `bank/evaluator/**` and is
not copied into Harbor task instructions.

Objective verification checks format, encoding, required evidence references,
and other explicit output constraints. These checks cannot determine whether
an open-ended answer reflects the intended policy. That semantic layer is the
required AI-judge measurement layer and will consume this data contract in the
next evaluation implementation step. Human criterion annotation is a later
qualification and calibration requirement, not a prerequisite for defining or
running the protocol.

## Public bank at a glance

There is one externally selectable dataset: the `public benchmark bank`.

| Item                                              |                                                                                 Census |
| ------------------------------------------------- | -------------------------------------------------------------------------------------: |
| Matched target pairs                              |                                                                                      8 |
| Synthetic targets                                 |                                                                                     16 |
| History records per target                        |                                                                                      8 |
| Case families                                     |                                                                                     32 |
| Conditions per case                               |                                                                                      3 |
| Agent executions in the full condition projection |                                                                                     96 |
| Domains                                           |                                                                     8, four cases each |
| Forms                                             |                                                  16 dialogue, 16 professional artifact |
| Transfer types                                    |                                           8 each: near, far, boundary, policy conflict |
| Task archetypes                                   | 8 each: recommendation, allocation/prioritization, design/threshold, critique/revision |

Each pair contains one case of each transfer type. Each target history contains
five diagnostic episodes, two boundary episodes where the decisions converge
because of a constraint, and one distractor episode. The eight records use the
four history formats exactly twice each: `decision_note`, `message_excerpt`,
`retrospective`, and `structured_log`.

The bank is synthetic and uses newly authored MIT-licensed project material.
The evaluator-only policy and criterion are construction hypotheses:
`authority: project_author_hypothesis`, `humanReviewed: false`.

## What the benchmark measures later

The data contract separates the following questions instead of collapsing them
into one quality score:

- **policy adherence** — whether the output reflects the selected case policy;
- **policy transfer** — whether that behavior appears on a held-out task rather
  than only in the history wording;
- **task performance** — whether the answer completes the requested task;
- **evidence grounding** — whether claims and required references remain tied to
  the supplied evidence;
- **critical failure** — whether a case-defined integrity or safety boundary is
  violated.

The exact semantic judgment protocol, human criterion collection, reliability,
and calibration are evidence work that follows this dataset contract. Missing,
invalid, unavailable, skipped, abstained, or judge-disagreeing results must
remain explicit; they must not become zero or success.

## Current status and limits

Repository status: `not_active`.

The complete synthetic construction corpus is present, but this is not an
activated public score. Passing tests and the project-side content review show
that the authored cases are internally complete and contract-consistent. They
do not establish construct validity, criterion validity, human agreement,
population validity, unseen-task generalization, agent performance, or a
leaderboard. Public exposure also means that no permanent secrecy or
contamination-free holdout claim is made.

This document does not establish benchmark validity, authentic-human transfer,
population validity, or product performance.

The next work unit implements the AI-judge contract as a `provisional`
measurement instrument for development. A later human-criterion study can
qualify and calibrate that instrument. Those are separate evidence states; the
absence of human annotations lowers the strength of the current validity claim,
but does not remove the need for an AI judge in the evaluation pipeline.

## Repository layout

```text
bank/public/       candidate-visible case manifests
bank/evaluator/    hidden policy and criterion material
bank/bank.json     canonical public-bank index and digest
bank/sampling-plan.json
harbor/            candidate-neutral Harbor projection
src/               contracts, rendering, validation, and data audit
tests/             contract and projection tests
docs/              design, terminology, and validity boundaries
qualification/     future human-criterion protocol; no current labels
```

`coffee-chat-eval` owns candidate adapters, provider/model/host execution,
Harbor orchestration, isolation evidence, and performance reports. This
repository owns the candidate-independent cases, evaluator material, rendering
boundary, and validity evidence plan.

## Run the construction checks

```bash
npm ci
npm run data:audit
npm run format:check
npm run typecheck
npm run check:inactive
npm test
npm run ci:policy
git diff --check
```

These commands validate the bank and its inactive boundary. They do not run a
candidate or activate a benchmark score.

## Read next

- [Data card](DATA-CARD.md) — census, case composition, provenance, and limits
- [Benchmark design](docs/benchmark-design.md) — construct, contracts, and evidence layers
- [Terminology map](docs/terminology.md) — research-standard terms and scope boundaries
- [Preregistration](PREREGISTRATION.md) — fixed conditions, falsifiers, and claim limits
- [Validity evidence plan](docs/validity/validity-argument-and-evidence-plan.md)
- [Construction review](docs/validity/bank-development-review.md) — direct review, resolved defects, and remaining evidence
- [Related work](docs/validity/related-work-and-discriminant-validity.md)
- [Human-criterion protocol](qualification/README.md) — future judge qualification

## Research references

- [Salemi et al., LaMP: When Large Language Models Meet Personalization (ACL 2024)](https://aclanthology.org/2024.acl-long.399/)
- [Wang et al., Learning Personalized Alignment for Evaluating Open-ended Text Generation (EMNLP 2024)](https://aclanthology.org/2024.emnlp-main.737/)
- [Guan et al., A Survey on Personalized Alignment (Findings of ACL 2025)](https://aclanthology.org/2025.findings-acl.277/)
- [Liu et al., AgentBench: Evaluating LLMs as Agents (ICLR 2024)](https://arxiv.org/abs/2308.03688)
- [Terminal-Bench](https://www.tbench.ai/) and [Harbor task documentation](https://www.harborframework.com/docs/tasks)
- [BetterBench](https://proceedings.neurips.cc/paper_files/paper/2024/hash/26889e8359e7ef8a7f5d77457364ca55-Abstract-Datasets_and_Benchmarks_Track.html)

## License

Repository software and benchmark material are MIT licensed. The synthetic
bank has no external data dependency. Report vulnerabilities according to
[SECURITY.md](SECURITY.md).

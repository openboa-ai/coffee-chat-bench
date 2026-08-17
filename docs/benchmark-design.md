# Benchmark design

## Status and scope

Coffee Chat Bench is `not_active`. This repository owns a candidate-independent
public bank for agent systems, the rendering boundary, objective artifact
contracts, evaluator-only construction material, and validity evidence plans.
It does not own candidate adapters, provider credentials, host execution, or
performance reports.

The benchmark is limited to a controlled synthetic question:

> Given the same task and evidence, can an agent infer a decision policy from a
> target's judgment history and transfer that policy to a held-out task while
> preserving task performance and evidence grounding?

The phrase **history-conditioned policy transfer** is an operational label for
this design, not a claim that the bank establishes a new psychological
construct. Related research uses terms such as personalization,
profile-conditioned generation, preference alignment, policy adherence, and
agent task evaluation. The terminology boundary is maintained in
[`terminology.md`](terminology.md).

The bank does not model a real person, recover authentic preferences, measure a
global personality trait, or establish Coffee Chat product performance. A
direct one-shot language-model completion is not a candidate; the candidate is
an agent system with a harness, configured model, host, tools, and execution
policy.

## Public bank and fixed sampling

There is one externally selectable `public benchmark bank`. It has no public
development, pilot, release, holdout, or judge-qualification split. Construction
status and future human-criterion work are represented as evidence states and
evaluator material, not as additional candidate datasets.

The fixed census is:

| Unit                       |               Count |
| -------------------------- | ------------------: |
| Matched target pairs       |                   8 |
| Synthetic targets          |                  16 |
| History records per target |                   8 |
| Held-out case families     |                  32 |
| Candidate conditions       |          3 per case |
| Full condition projection  | 96 agent executions |

The 32 cases cover eight domains, four cases per domain. Each pair contains one
`near_transfer`, one `far_transfer`, one `boundary`, and one
`policy_conflict` case. Forms are balanced between `dialogue` and
`professional_artifact`; task modes are balanced between `bounded` and
`open_ended`; recommendation, allocation/prioritization, design/threshold,
and critique/revision each occur eight times. The complete matrix is frozen in
[`../bank/sampling-plan.json`](../bank/sampling-plan.json).

## Matched target histories

Target A and target B receive identical historical situations, evidence
identifiers, and record formats. Their decisions differ in ways that are both
defensible under the supplied facts. Each target has:

- five diagnostic episodes that provide evidence for the target's decision
  policy;
- two boundary episodes where a shared safety or integrity constraint makes
  the decisions converge; and
- one distractor episode that should not identify the policy.

The construction gate checks these roles against the visible records: the
five diagnostic records differ across A and B, while the two boundary records
and neutral distractor converge. This is a controlled counterfactual design
constraint, not evidence that the synthetic targets represent real people.

Each history uses two records of each format: `decision_note`,
`message_excerpt`, `retrospective`, and `structured_log`. At most four records
include a partial rationale. Policy names, target identity, generalized
personality labels, and held-out answers are not candidate-visible. A/B total
history length is within ten percent for every pair.

The evaluator-only policy card contains three ordered decision cues, one shared
safety/integrity veto, a target-specific tie-breaker, and its boundary
condition. Cue names are sampling tags, not psychological trait labels.

## Three execution conditions

Every case is rendered under exactly these conditions:

| Condition       | Candidate input                      |
| --------------- | ------------------------------------ |
| `unconditioned` | Task and evidence only               |
| `target_a`      | Task, evidence, and target A history |
| `target_b`      | Task, evidence, and target B history |

The candidate does not receive the condition name, target identity, hidden
policy, evaluator criterion, or the other target's history. `renderCase` returns
only the selected history; the Harbor projector writes only that rendered input
to the candidate task.

The canonical case manifest necessarily stores both contexts so an evaluator
can render the three conditions reproducibly. This is a repository-level
storage fact, not permission for a candidate adapter to pass both contexts into
one agent execution.

## Contract layers

The implementation keeps the contracts small and separates responsibilities:

- `CaseManifest` — task, evidence, output contract, three condition contexts,
  and public lineage;
- `EvaluatorMaterial` — policy hypothesis, history roles, and criterion
  specification kept outside candidate input;
- `BankManifest` — one public-bank index, sampling-plan digest, case paths, and
  bank digest;
- `CandidateTask` — the selected candidate-visible projection;
- `RunReceipt` — a future execution receipt with explicit success and failure
  states, including host and cleanup evidence.

The bank package does not import a candidate, product repository, or provider.
`coffee-chat-eval` supplies the adapter, agent/model/host matrix, isolated
execution, and report. This allows another agent harness to consume the same
input/output contract.

## Measurement layers

The benchmark keeps objective verification and semantic judgment separate.

1. **Objective verification** checks byte limits, UTF-8 encoding, required
   evidence references, and the explicit output contract. It can reject an
   invalid artifact but cannot award open-ended policy alignment.
2. **AI judge (LLM-as-a-judge)** is the required semantic measurement layer for
   policy adherence, policy transfer, task performance, evidence grounding,
   and case-defined critical failures. Its protocol is the next implementation
   unit.
3. **Human criterion** is a later, independently blinded reference used to
   assess AI-judge reliability, calibration, disagreement, abstention, and
   bias. Human annotation is not required to define the judge interface, but it
   is required before making human-grounded validity claims.

The future judge has two evidence states. `provisional` means the fixed judge
protocol can support development measurement while human-grounded evidence is
incomplete. `qualified` means the declared human-criterion and reliability
requirements have been met for the stated scope. Neither state activates this
repository by itself.

Missing, invalid, unavailable, skipped, abstained, or judge-disagreeing
evidence remains explicit and nonnumeric. It is never replaced by zero or by a
successful default.

## Harbor boundary

The candidate-neutral projector materializes exactly 96 tasks: 32 cases × 3
conditions. Each task contains a pinned no-network environment, the selected
instruction and evidence, an output contract, and an objective structural
verifier. Evaluator policy, criteria, other contexts, credentials, and hidden
expected decisions are not written into the task.

Harbor execution is a projection and isolation check. A structural verifier
can establish that an artifact satisfies the explicit file contract; it cannot
establish policy adherence, utility, or evidence quality. Agent adapters,
provider credentials, host evidence, and semantic judging belong to
`coffee-chat-eval`.

## Data-quality gates

`npm run data:audit` is the construction gate. It checks:

- exact census and one-bank identity;
- sampling-plan/index digest binding;
- pair, domain, form, transfer, mode, and archetype coverage;
- eight history records and two occurrences of each format per target;
- shared A/B record IDs, formats, and evidence references;
- A/B history length parity;
- five/two/one history-role assignment;
- evaluator criterion authority and `humanReviewed: false`;
- synthetic URI and MIT provenance;
- absence of legacy split/qualification identifiers and evaluator leakage.

Mechanical checks are necessary but not sufficient. Construction review must
also inspect policy recoverability, defensibility of both targets, boundary
sensitivity, answer leakage, lexical shortcuts, and held-out transfer. That
review is construction QA, not human criterion annotation or construct validity.

## Validity and claim boundary

Repository tests establish contract consistency and projection integrity. They
do not establish construct validity, criterion validity, human agreement,
population validity, authentic-person generalization, or agent performance.
The repository remains `not_active`, publishes no leaderboard, and makes no
measured public claim.

The design uses the evidence-oriented benchmark perspective in
[BetterBench](https://proceedings.neurips.cc/paper_files/paper/2024/hash/26889e8359e7ef8a7f5d77457364ca55-Abstract-Datasets_and_Benchmarks_Track.html),
the agent task/environment/verifier separation in
[Terminal-Bench](https://www.tbench.ai/) and
[Harbor](https://www.harborframework.com/docs/tasks), and terminology from
[LaMP](https://aclanthology.org/2024.acl-long.399/) and
[personalized-alignment evaluation work](https://aclanthology.org/2024.emnlp-main.737/).
These references motivate the design; they do not validate this synthetic bank.

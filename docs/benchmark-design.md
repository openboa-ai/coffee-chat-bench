# Benchmark design

## Status and construct boundary

Coffee Chat Bench is `not_active`. It owns one candidate-independent public
input bank for agent systems and the evaluator that scores externally produced
submissions. It does not run candidate agents, select providers, manage
credentials, or publish performance reports.

The surrounding research area is **personalized alignment**. This Bench does
not claim to measure an entire person or a psychological trait. Its narrower
operational estimand is **target-conditioned judgment alignment**:

> Holding the task and evidence fixed, does access to a target's prior decision
> history change an agent's held-out judgment in the target-consistent
> direction, distinguish that target from a matched alternative, and preserve
> task performance and evidence grounding?

The candidate is an agent system: harness, configured model, tools, host, and
execution policy. A direct one-shot language-model completion is not a
candidate in this benchmark.

## Experimental unit

One case family holds the task and five-document bundle constant and renders
three conditions:

| Condition       | Candidate input                   |
| --------------- | --------------------------------- |
| `unconditioned` | task and documents                |
| `target_a`      | task, documents, target A history |
| `target_b`      | task, documents, target B history |

The two histories share situations, facts, IDs, formats, and approximate
length. They differ only in observed judgments where multiple defensible
choices exist. This matched design is intended to reduce explanations based on
topic, information access, or writing format.

The public bank contains 8 matched pairs, 16 synthetic targets, 32 case
families, and 96 agent-condition projections. Each pair spans `near_transfer`,
`far_transfer`, `boundary_condition`, and `cue_conflict`.

## Candidate submission as observable evidence

The candidate returns a final artifact and a structured `decisionRecord`:

```ts
interface CandidateSubmission {
  artifact: {
    mediaType: "text/plain";
    content: string;
  };
  decisionRecord: {
    decision: string;
    evidenceUse: readonly { sourceId: string; use: string }[];
    tradeoffs: readonly {
      factors: readonly [string, string];
      resolution: string;
    }[];
    constraints: readonly { constraint: string; handling: string }[];
    uncertainty: string | null;
  };
}
```

The record captures a **stated rationale**. It is not private chain-of-thought,
a raw execution trace, or a replacement for the final artifact. It is required
because the benchmark needs observable evidence about cue use and trade-off
resolution, but its score cannot compensate for artifact-level failure.

Objective validation occurs before semantic Judge calls. It checks file and
schema contracts plus whether every `sourceId` was visible in that condition.

## Pointwise measurement model

Each semantic dimension is called independently with its own instructions and
ordinal anchors:

| Dimension                    | Evidence shown to Judge                          | Result             |
| ---------------------------- | ------------------------------------------------ | ------------------ |
| `judgment_alignment`         | task, evidence, selected history, final artifact | 1–5                |
| `stated_rationale_alignment` | same input, final artifact, decision record      | four 1–5 facets    |
| `task_performance`           | task, evidence, final artifact                   | 1–5                |
| `evidence_grounding`         | task, evidence, final artifact                   | 1–5                |
| `hard_constraint_violation`  | task, evidence, final artifact                   | boolean or abstain |

The stated-rationale facets are:

- `cue_utilization`: whether relevant decision cues are identified and used;
- `cue_weighting`: whether their relative importance matches the observed
  target judgments;
- `context_sensitivity`: whether boundary conditions and changing context
  alter the reasoning appropriately; and
- `action_consistency`: whether the stated rationale supports the artifact's
  actual decision.

`judgment_alignment` and `stated_rationale_alignment` are target-relative and
therefore `not_applicable` for `unconditioned`. The remaining dimensions are
measured in all conditions. There is no common generic anchor and no composite
pointwise score.

## Mirrored pairwise measurement

Pointwise ratings alone can hide scale-use and calibration differences. The
case-family evaluator also conducts four target-conditioned pairwise
comparisons:

| Reported evidence     | History shown | First logical artifact | Second logical artifact |
| --------------------- | ------------- | ---------------------- | ----------------------- |
| conditioning effect A | target A      | target A               | unconditioned           |
| conditioning effect B | target B      | target B               | unconditioned           |
| target specificity A  | target A      | target A               | target B                |
| target specificity B  | target B      | target B               | target A                |

Every comparison is presented twice: canonical order and reversed order. The
model sees arbitrary left/right labels, one history, the task/evidence, and two
final artifacts. It never sees condition identities or decision records.

The two calls are normalized back to the same logical artifacts. If they do
not identify the same winner or tie after reversal, the result is
`order_inconsistent` and remains nonnumeric. This makes positional sensitivity
visible rather than averaging it away.

For `boundary_condition` cases, convergence is reported directly from two
target-specificity ties plus hard-constraint compliance by both conditioned
artifacts. For other transfer strata it is `not_applicable`.

The evaluator exposes these measurements without a universal success verdict.
In particular, it does not apply fixed cutoffs to manufacture
`transferred`/`not_transferred`. A consuming evaluation report may later
aggregate preregistered rates and deltas across independent cases, forms, and
blocks while preserving the underlying evidence states.

## Responsibility boundaries

```text
external producer / coffee-chat-eval
  -> runs agent and returns CandidateSubmission

coffee-chat-bench
  -> renders input
  -> validates submission
  -> constructs provider-neutral Judge requests
  -> parses pointwise and mirrored pairwise results

external Judge transport
  -> communicates with a configured evaluator model
```

The Bench owns Judge semantics and parsing so every consumer evaluates the same
input/output contract. The injected transport owns only communication. Eval
owns candidate adapters, models, hosts, isolation, retries, receipts, and
cross-candidate reporting.

## Harbor projection

The Harbor projector materializes 32 cases × 3 conditions as 96 no-network
tasks. Each task requests `/workspace/artifact.txt` and
`/workspace/decision-record.json`. Its structural verifier can validate only
the objective submission contract. Harbor reward is not semantic benchmark
credit.

## Evidence hierarchy

1. **Construction evidence**: census, matching, provenance, scenario review.
2. **Objective verification**: file, reference, and schema contracts.
3. **Provisional AI-judge measurement**: semantic pointwise and pairwise
   results without human-grounded qualification.
4. **Human criterion evidence**: blinded annotation used to estimate Judge
   agreement, reliability, and calibration.
5. **Construct validity evidence**: falsification studies, interventions,
   replication, and bounded claims.

Code tests can establish only the first two layers and evaluator mechanics.
They cannot activate the benchmark.

## Claim boundary

The synthetic public bank does not establish authentic-human judgment
transfer, population validity, unseen-task generalization, AI-judge validity,
agent benefit, an active score, or a leaderboard. All missing, invalid,
unavailable, abstained, and order-inconsistent results remain explicit and
nonnumeric.

The design draws on personalized-alignment research, judgment-history
conditioning, agent benchmark separation, and benchmark-validity practice:
[Survey on Personalized Alignment](https://aclanthology.org/2025.findings-acl.277/),
[LaMP](https://aclanthology.org/2024.acl-long.399/),
[Learning Personalized Alignment](https://aclanthology.org/2024.emnlp-main.737/),
[AgentBench](https://arxiv.org/abs/2308.03688),
[BetterBench](https://proceedings.neurips.cc/paper_files/paper/2024/hash/26889e8359e7ef8a7f5d77457364ca55-Abstract-Datasets_and_Benchmarks_Track.html),
and [Harbor](https://www.harborframework.com/docs/tasks). These references
motivate the design; they do not validate this bank.

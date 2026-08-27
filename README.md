# Coffee Chat Bench

> Candidate-independent benchmark for measuring perspective capture,
> application, and Skill triggering.

## Essence

The benchmark is the product's north-star instrument: a result is useful only
when it shows that a person's priorities, trade-offs, boundaries, and
uncertainty were captured or applied, not merely that facts were repeated.

## Role

Bench is the independent measurement-definition layer. It owns cases, semantic
Ground Truth, criteria, graders, and research; Product owns Skills, Roastery
owns source data, and Eval owns execution evidence.

## Goal

Make it possible to distinguish Roast's perspective capture from Brew's
perspective application, and to distinguish both output quality and triggering,
so iteration can improve the Product without changing the measuring stick.

## Why

The product hypothesis is that useful judgment depends on perspective, not only
on knowledge. A benchmark must therefore test whether an agent preserves a
person's priorities, trade-offs, boundaries, and uncertainty in a new output.
The benchmark is the product's north-star instrument: its cases and criteria
must remain meaningful even when the Product or host changes.

## What

The candidate interface is deliberately small:

~~~text
prompt + input -> output
~~~

- prompt may be a request, purpose, question, situation, event, or trigger;
- input is the complete managed environment and context, including text, files,
  directories, Origin, Bean, and task state;
- output may be text, files, directory state, a decision, or an action result.

Product names are explanatory mappings, not candidate API types:

- perspective capture corresponds to Roast: Origin -> Bean;
- perspective application corresponds to Brew: Bean -> Coffee.

The bank does not store candidate outputs or claim to reconstruct a real
person. Ground Truth is built from user-reviewed semantic criteria and accepted
outcomes, not one exact reference paragraph.

## How

Each case materializes a prompt, a complete candidate-visible input, and
expected-output criteria. Eval runs the same case in paired `without-skill` and
`with-skill` conditions. Ground Truth is confirmed by the owner before it is
used, deterministic constraints are kept separate from semantic grading, and
output quality is never merged with trace-based triggering.

## Evaluation constructs

### Perspective capture

Does the candidate extract a source-supported perspective rather than merely
summarizing facts? Criteria cover priority, trade-off, judgment boundary,
context, uncertainty, and forbidden inference.

The same case is later run with and without Roast. The with-skill result is a
candidate only; a Bean exists only after explicit user confirmation.

### Perspective application

Does the candidate use a confirmed Bean in a new situation?

- Human Understanding: can a blinded reader recover and predict the owner's
  priorities and boundaries?
- Agent Judgment / Action: does the choice, artifact, or bounded action result
  reflect those priorities while preserving task correctness, safety, and
  authority?

These are co-primary surfaces of Brew, not separate product Skills.

### Triggering

Triggering is evaluated separately from output quality. Direct and implicit
positive, ambiguous, insufficient-evidence, near-miss, and wrong-Skill-boundary
cases determine whether Roast or Brew should activate, clarify, or abstain.
Activation is established from execution trace, not inferred from prose
quality.

## Repository layout

~~~text
coffee-chat-bench/
├── README.md
├── evals/
│   ├── README.md
│   ├── output-quality/
│   │   ├── perspective-capture/
│   │   │   └── .gitkeep
│   │   └── perspective-application/
│   │       ├── human-understanding/
│   │       │   └── .gitkeep
│   │       └── agent-judgment-action/
│   │           └── .gitkeep
│   └── triggering/
│       ├── perspective-capture/
│       │   └── .gitkeep
│       └── perspective-application/
│           └── .gitkeep
├── graders/
│   └── README.md
└── research/
    └── README.md
~~~

Each future case uses the same envelope:

~~~text
<case-id>/
├── prompt/
├── input/
└── expected-output/
~~~

Cases own candidate-visible material. Criteria and Ground Truth remain
independent from the candidate and are not copied into input. Actual output,
trace, timing, grading, and human feedback belong to coffee-chat-eval.

## Evaluation rules

- Compare with-skill and without-skill under the same prompt and input.
- For Brew, use the same confirmed Bean in both arms.
- Keep Roast, Brew, Human Understanding, Agent Judgment / Action, and
  triggering results separate.
- Use deterministic assertions for observable constraints and human-calibrated
  semantic graders for open-ended quality.
- Permit ties, abstentions, unavailable, and disagreement states; never convert
  them into an arbitrary zero or pass.
- Freeze the benchmark and qualified Judge while changing a Product Skill.

Matched counterfactual cases may hold facts constant while changing the
confirmed perspective, allowing the benchmark to test whether different Beans
produce different Coffee. They are cases for analysis, not a third arm in the
Roast or Brew with/without-skill comparison.

## North Star

No single average score is sufficient. The benchmark follows the conjunction
of Roast perspective-capture lift, Brew Human Understanding lift, Brew Agent
Judgment / Action lift, Roast/Brew triggering reliability, confirmation-boundary
compliance, and successful Origin -> confirmed Bean -> Coffee flow.

## Ownership boundary

This repository owns cases, criteria, Ground Truth, graders, and research
records. It does not execute candidates, store Coffee, store private Beans,
own host credentials, or report Product performance by itself.

## Status

This is the benchmark skeleton. It becomes an active measurement instrument only
after cases are populated, user-reviewed Ground Truth is recorded, graders are
calibrated, and coffee-chat-eval preserves reproducible execution evidence.

## License

Benchmark definitions and documentation are MIT licensed, Copyright © 2026
Openboa AI. Any future case material must carry its own verified rights and
provenance.

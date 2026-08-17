# Public Judgment-History Bank Content Design

**Status:** approved for implementation
**Repository status after implementation:** `not_active`

## Purpose

The bank must make one candidate-independent question observable:

> Given the same task and evidence, can an agent infer a target's conditional
> judgment policy from prior decisions and apply it to a new situation while
> preserving task utility and evidence grounding?

The data, rather than the judge implementation, must instantiate this problem.
Every case must therefore remain interpretable before an AI judge exists.

## Units retained

- one public benchmark bank;
- eight matched target pairs and sixteen synthetic targets;
- eight history records per target: five diagnostic, two boundary, and one
  distractor;
- four held-out cases per pair: near transfer, far transfer, boundary, and
  policy conflict;
- three conditions per case: `unconditioned`, `target_a`, and `target_b`;
- 32 case families and 96 agent-condition executions.

## Content requirements

### Matched histories

Each A/B history pair uses the same situation, concrete evidence, evidence
identifiers, and record format. Diagnostic records contain a genuine trade-off
and two defensible decisions. The decisions reveal a conditional priority
without naming the hidden policy or repeating a fixed slogan. At most the first
four records include a short natural-language rationale.

Boundary records contain a material veto that overrides the ordinary A/B
difference, so both targets take the same action for the same reason. The
distractor contains no live trade-off and gives the same routine decision for
both targets.

Historical evidence identifiers are not decorative. Their associated facts
are written directly into the candidate-visible record so a reader can judge
whether both decisions are defensible.

### Held-out cases

Every case includes a complete decision situation:

- actual alternatives or a concrete draft artifact;
- at least three substantive evidence items;
- enough evidence for both target-consistent decisions to be defensible;
- no answer, policy label, or target identity in candidate-visible material;
- a task that can be completed without inventing missing facts.

`near_transfer` reuses the kind of trade-off shown in history without copying a
scenario or answer. `far_transfer` moves the same policy to a materially
different domain and task shape. `boundary` activates the shared veto and must
produce the same required direction for A and B. `policy_conflict` supplies a
complete proposal or artifact where both priorities matter and the target's
tie-breaker determines the revision.

### Policy coverage

The eight pairs cover different judgment conflicts rather than one
experiment-versus-caution template:

1. reversible learning versus coordinated commitment;
2. diagnostic informativeness versus reproducible evidence;
3. participatory legitimacy versus accountable delegation;
4. protected service floors versus aggregate reach;
5. defense-in-depth margin versus rapid contained mitigation;
6. source fidelity versus bounded audience learning;
7. learner agency versus consistent mastery progression; and
8. diversification resilience versus concentrated evidence-backed commitment.

No policy is globally superior. Each target can satisfy the same objective task
contract, and the shared veto prevents a target policy from licensing an
integrity or safety failure.

### Sampling coverage

Each pair's four held-out cases use four different domains. Across the bank,
every transfer type appears once in every domain. Form, task mode, and task
archetype rotate across pairs so transfer type is not a synonym for dialogue,
artifact, boundedness, or one task archetype.

## Direct review standard

The author reads every pair as a coherent case set. Admission asks:

1. Is the underlying judgment conflict real and relevant to the benchmark
   purpose?
2. Are A and B both defensible from the same facts?
3. Is history necessary to select the target-specific direction?
4. Does the held-out task require transfer rather than phrase copying?
5. Does the boundary case actually force convergence?
6. Does the conflict case expose a priority or tie-breaker?
7. Can a capable agent complete the task without inventing evidence?

Mechanical checks remain limited to stable contracts such as census, complete
evidence packets, condition isolation, public/evaluator separation, and the
declared sampling matrix. They do not substitute for this semantic review.

## Non-claims

This synthetic bank does not establish authentic human preference modeling,
population validity, AI-judge reliability, agent performance, or benchmark
activation. Human criterion annotation and AI-judge calibration remain later,
separate evidence work.

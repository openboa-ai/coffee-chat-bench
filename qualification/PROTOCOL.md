# Human criterion protocol (future)

## Purpose and boundary

This protocol will assess whether the fixed AI judge is a useful measurement
instrument for the synthetic public bank. It will not validate authentic human
preferences, population behavior, or a real person's judgment. The repository
remains `not_active` until the required evidence is collected and reviewed.

The protocol follows the distinction between a criterion and the instrument
being qualified. Model agreement with itself is not human criterion evidence.
The future judge will be evaluated against independently blinded human labels,
with `abstain` available whenever the task or criterion is insufficient.

## Blind annotation packet

An annotator will receive only:

- the task and explicit output contract;
- supplied evidence;
- one anonymous candidate artifact or an anonymous pair of artifacts; and
- a dimension-specific criterion projection.

The packet must exclude case ID, target identity, condition name, policy card,
expected direction, candidate identity, model identity, and other annotator
labels. Text inside the task, evidence, or artifact is quoted data and cannot
override the annotation protocol.

## Labeling

Pointwise dimensions use `pass`, `fail`, or `abstain`. Pairwise dimensions use
`left`, `right`, `tie`, or `abstain`. Annotators must judge only the declared
dimension, use the supplied evidence, and preserve uncertainty rather than
guessing. Missing or malformed records remain explicit.

## Qualification evidence

The future report will include raw counts and breakdowns by form, dimension,
domain, transfer type, and task mode. It will retain disagreement and
abstention rather than forcing a consensus. The AI judge will be qualified only
for the scope supported by the collected evidence and will remain `provisional`
otherwise.

Human criterion collection, model transport, credentials, and execution are
outside the benchmark bank and must not be implemented as provider logic here.

# Harbor projection

This directory projects the validated public bank into candidate-neutral Harbor
tasks. It does not select or run an agent, call an AI judge, manage credentials,
or create a performance report.

The projector follows Harbor's documented task structure with external schema
`1.4`. Every projected task contains:

- one candidate-visible instruction and selected history;
- a pinned, no-network candidate environment;
- `/workspace/input/` documents for workspace-form tasks;
- `/workspace/artifact.txt`;
- `/workspace/decision-record.json`; and
- a separate structural verifier environment.

The final artifact must satisfy the case's UTF-8, byte, and required-reference
contract. The decision record must contain the declared fields and may cite
only document or history IDs visible to that candidate condition. It is a
stated rationale, not hidden chain-of-thought.

The structural verifier writes `/logs/verifier/reward.txt`. A value of `1`
means only that both files satisfy the objective submission contract. It is not
semantic benchmark credit and cannot establish judgment alignment, task
performance, evidence grounding, or activation.

Run the projection into an absolute path that does not yet exist:

```sh
node --experimental-strip-types harbor/project.ts bank /absolute/path/to/output
```

The output contains exactly 96 `task-<digest>` directories and one projection
manifest. Verification reconstructs the expected bytes from the validated bank
rather than trusting the generated manifest.

No condition name, target identity, construction annotation, reference label,
Judge rubric, provider credential, or candidate identity enters a task. The
Eval repository owns installed-Harbor execution, isolation evidence, candidate
receipts, and delivery of the resulting submission to this Bench evaluator.

See [Harbor task documentation](https://www.harborframework.com/docs/tasks) for
the external task format.

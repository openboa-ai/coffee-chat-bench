# Harbor projection

This directory owns one candidate-neutral projection from the validated public
bank into Harbor tasks. It is not a provider, model, agent, judge, receipt, or
report adapter.

The projector emits the current Harbor single-step task shape documented in
[Task Structure](https://www.harborframework.com/docs/tasks): `task.toml` with
external schema `1.4`, an instruction, a no-network pinned container, a
declared `/workspace/answer.txt` artifact, a structural Oracle, and a structural
verifier. The task's `tests/` directory contains its own copy of the pinned
Dockerfile so Harbor's `environment_mode = "separate"` can build the verifier in
a fresh container rather than reusing the candidate environment; that image
copies only the verifier script into `/tests`. The verifier accepts only a
bounded regular file and writes
`/logs/verifier/reward.txt`; `1` means the response satisfies the objective
byte, UTF-8, and reference contract. It is never semantic benchmark credit.

Run the projection with an absolute new output directory:

```sh
node --experimental-strip-types harbor/project.ts bank /absolute/path/to/output
```

The output contains 80 `task-<digest>` directories and one evaluator-side
projection manifest. Verification reconstructs the expected projection from
the validated bank instead of trusting that manifest as its own authority. No
condition, policy, rubric, expected direction, system identity, or credential
enters a task directory. The Eval repository owns installed-Harbor validation
and all actual system execution.

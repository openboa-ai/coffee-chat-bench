# Coffee Chat Bench

Coffee Chat Bench is the official candidate-independent benchmark repository for
Coffee Chat.

## Status

Repository status: `not_active`.

This trust base contains governance, an executable no-claim boundary, and
deferred activation criteria only. It does not provide a benchmark, metric, result, or validity claim. Passing CI verifies those local contracts; it does not establish benchmark validity or activate this repository.

The [activation criteria](docs/validity/activation-criteria.md) define the
evidence required before this status may change. They do not define a Taste
construct or make a capability claim.

## Ownership boundary

This repository will own candidate-independent benchmark design and validity
evidence after activation. It does not own Coffee Chat implementation tests,
private product internals, evaluator execution, or a complete Coffee Chat
report.

## License

Governance and reusable documentation are licensed under the
[MIT License](LICENSE), Copyright (c) 2026 Openboa AI.

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
Install Gitleaks, then enable staged-secret prevention with
`git config core.hooksPath .githooks`. Run
`gitleaks git --redact --no-banner .` for a complete history scan; required
CI performs that scan independently.

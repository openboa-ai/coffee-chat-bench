# Coffee Chat Bench

Coffee Chat Bench is the official candidate-independent benchmark repository for
Coffee Chat.

## Status

Repository status: `not_active`.

This trust base contains governance, an executable no-claim boundary,
experimental candidate-independent design and implementation paths, and
deferred activation criteria. It does not provide an active benchmark, measured result, leaderboard, Product-specific credit, or validity claim. Passing CI verifies those local contracts; it does not establish benchmark validity or activate this repository.

## Experimental boundary

While the repository is `not_active`, the role-labelled roots `bank/`,
`config/`, `docs/superpowers/`, `docs/validity/`, `harbor/`, `perspectives/`,
`schemas/`, `src/`, and `tests/` may hold experimental benchmark design and
implementation. Those public materials are candidate-independent and are not
measured benchmark artifacts. The boundary rejects active status, measured
results, leaderboards, Product-specific credit, candidate-specific imports,
and unlabelled measurement-artifact paths.

The [activation criteria](docs/validity/activation-criteria.md) define the
evidence required before this status may change. They do not define a Taste
construct or make a capability claim.

## Ownership boundary

This repository owns candidate-independent experimental benchmark design and
validity evidence. It does not own Coffee Chat implementation tests, private
product internals, evaluator execution, or a complete Coffee Chat report.

## License

Governance and reusable documentation are licensed under the
[MIT License](LICENSE), Copyright (c) 2026 Openboa AI.

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
Install Gitleaks, then enable staged-secret prevention with
`git config core.hooksPath .githooks`. Run
`gitleaks git --redact --no-banner .` for a complete history scan; required
CI performs that scan independently.

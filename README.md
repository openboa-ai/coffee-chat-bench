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

## Manual experimental judgment entrypoint

`node --experimental-strip-types src/cli.ts judge <projection-root> <artifact>
<isolated-verifier-attestation>` is a bounded, manual experimental entrypoint
for a single already-projected artifact. It never executes a projected verifier
on the operator host. Eval, as the trusted caller, generates one random
32-byte base64url capability key for that execution and injects it only as the
inherited `COFFEE_CHAT_EVAL_ATTESTATION_KEY` environment variable of the
host-side `judge` process after candidate shutdown. It never passes through
Harbor, candidate arguments, candidate environment, or the CLI argv. The CLI
copies the key into local memory and immediately deletes the environment entry.
Its strict isolation attestation carries an `attestationMac`: an HMAC-SHA256
over the canonical attestation fields excluding the MAC. That MAC covers the
exact Bench commit and bank digest along with candidate, verifier, projection,
and artifact digests, plus candidate-only mount, verifier-only judgment,
output-only transfer, network-disabled, and cleanup evidence. Missing,
malformed, or forged attestations/MACs are `verifier_failure` with zero
provider calls; capability keys and MACs are never logged or persisted in a
judgment result.

This capability authenticates the trusted Eval execution boundary against an
untrusted candidate attempting path, projection, or attestation forgery. It is
not a global signing PKI and does not claim to defend against a malicious Eval
operator. Bench retains the MAC-bound `benchCommit` and `bankDigest` as result
provenance; Eval must pin those exact merged Bench values before execution.
This package intentionally does not independently compare a bank digest to Git
or a network source, so that final provenance selection remains a trusted
operator responsibility rather than a false local proof.

Only an accepted attestation is sent in memory to exactly the configured Terra
and Luna panel, with a 32,768 UTF-8-byte request ceiling and a 1,024-token
output ceiling per request. The CLI validates the projection, artifact,
attestation, and MAC before it constructs a transport or reads
`OPENAI_API_KEY`. The command emits one JSON result and returns zero only for a
completed `measured` panel result; it is not invoked by CI.

This command does not activate the repository, make a live benchmark result,
or create Product-specific credit. It requires an explicit operator invocation
and an `OPENAI_API_KEY`; tests use fake transports and make no provider call.

## Calibration boundary

The public CLI has no single-projection `calibrate` command and never executes
a caller-provided projected verifier on the Bench host. Candidate calibration
that needs verifier execution belongs to Eval/Harbor isolation. Bench retains
only `calibrate-bank` for deterministic control validation: it creates a fresh,
validated empty workspace, regenerates projection JSON from trusted committed
Bench code, and launches its local batch with only `PATH` and locale variables.
The batch always imports the canonical sibling `harbor/verifier.py` derived
from `harbor/calibrate.py` itself; projected verifier paths are never batch
inputs or executable authority. No OpenAI key, Eval capability, host
authentication, or provider environment is inherited by that subprocess or the
canonical verifier it imports.

## License

Governance and reusable documentation are licensed under the
[MIT License](LICENSE), Copyright (c) 2026 Openboa AI.

## Security

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
Install Gitleaks, then enable staged-secret prevention with
`git config core.hooksPath .githooks`. Run
`gitleaks git --redact --no-banner .` for a complete history scan; required
CI performs that scan independently.

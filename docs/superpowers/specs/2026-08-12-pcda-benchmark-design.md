# PCDA benchmark design

## Decision and status

Coffee Chat Bench is `not_active`. This confirmed design permits public,
candidate-independent experimental work on a synthetic PCDA benchmark without
representing that work as an active benchmark, measured result, leaderboard,
validity conclusion, or Coffee Chat Product credit.

The design is limited to a fixed public synthetic bank. It makes no claim about
real-person understanding, realized utility, or unseen-task generalization.
Activation remains a separate decision requiring the evidence in
[`../../validity/activation-criteria.md`](../../validity/activation-criteria.md).

## Ownership and interfaces

`openboa-ai/coffee-chat-bench` owns the candidate-independent construct, public
source bank, candidate-visible task projection, sealed judgment/verifier
projection, metric design, and validity evidence. `openboa-ai/coffee-chat-eval`
may consume an exact published Bench commit through a public interface, but it
does not alter a Bench case, metric, judgment, or verifier. `coffee-chat` is an
external candidate and its Product internals are not an admissible dependency.

Candidate-visible task files and judgment/verifier files are separate Harbor
environments. Both are public source material, but the candidate environment
does not receive the judgment material at execution time. A candidate receives
no credit from private Product state.

Bench deterministically projects that separation, but a projected `task.toml`
or candidate-authored `accessedPaths` field is not host-isolation evidence.
`accessedPaths` is only an additional fail-closed candidate declaration. The
separately owned Eval runtime must attest that Harbor mounted only the candidate
projection, kept the baked judgment in the verifier environment, transferred
only `/app/output.json`, disabled candidate network access, and cleaned up the
host. Missing or contradictory host evidence is `host_failure`, never a clean
trial or benchmark evidence.

## Experimental role roots

The following roots are expressly labelled experimental while the status is
`not_active`:

| Root                                         | Role                                                                     | Inactive constraint                       |
| -------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| `bank/` and `perspectives/`                  | Public synthetic source material                                         | Source design only; no measured artifacts |
| `schemas/`, `src/`, `harbor/`, and `config/` | Candidate-independent contracts, projection, verifier, and configuration | No Product or candidate-specific import   |
| `tests/`                                     | Deterministic local contract and fixture verification                    | No provider/model execution in CI         |
| `docs/superpowers/` and `docs/validity/`     | Design, plan, and validity-method documentation                          | No activation or measured claim           |

The checker classifies JSON by its explicit experimental role and content:
`bank/` source, `config/` configuration, and `schemas/*.schema.json` schema.
Bank or configuration objects declared as benchmark runs, benchmark results,
measured results, leaderboards, or with a measured result state are rejected;
other experimental JSON is unclassified and rejected. A run artifact therefore
cannot bypass the boundary by choosing a neutral filename, while legitimate
source/configuration JSON and a results schema remain valid. It scans every
tracked Markdown document, including experimental design and plan material, for
concrete task, dataset, metric, score, result, accuracy, leaderboard,
active-status, measured-result, and Product-credit declarations. It tokenizes
module specifiers in executable `config/`, `harbor/`, `src/`, and `tests/`
files, including Python comma-separated imports and
`importlib.import_module(...)`, rejecting candidate-specific or Coffee Chat
Product imports.

## Proposed experimental construct

PCDA is a synthetic, fixed-public-bank experiment in which task adequacy,
evidence integrity, perspective alignment, invariants, and critical failures
are conjunctive. No universal weighted score is defined. Reliability and
efficiency remain separate from qualification.

The source-bank and projection design must preserve:

- distinct `measured`, `candidate_invalid`, `candidate_failure`,
  `host_failure`, `verifier_failure`, `judge_disagreement`,
  `judge_unavailable`, `skipped`, `unavailable`, and `unmeasured` states;
- public source material with candidate-visible task inputs separated from
  runtime-isolated judgment/verifier inputs;
- deterministic local tests and CI with no provider/model call or provider
  secret; and
- CalVer `2026.8.12` as the only release identity.

These are experimental design constraints, not evidence that a benchmark has
been activated or measured.

## Activation boundary

Activation requires independently reviewable construct, controls, independence,
reliability, validity, reproducibility, statistical, feasibility, security,
privacy, and written-decision evidence. The applicable floors include per-judge
synthetic meta-evaluation balanced accuracy of at least `0.90`, panel balanced
accuracy of at least `0.95`, critical sensitivity of at least `0.95`, critical
false-positive rate no greater than `0.05`, prompt contradiction no greater
than `0.05`, overall disagreement no greater than `0.10`, and stratum
disagreement no greater than `0.15`.

The direct-context experimental comparison requires QPCFR uplift of at least
`0.10` with a paired cluster-bootstrap lower bound above zero, irrelevant effect
within plus or minus `0.05`, paraphrase-invariant preservation of at least
`0.95`, three-run family agreement of at least `0.80` overall and `0.70` per
core stratum, and two clean runs within plus or minus `0.05` QPCFR. These are
future decision gates only; missing, unavailable, or unmeasured evidence does
not satisfy them.

Measurement design is independent of execution funding. Sample scope,
conditions, repetitions, controls, exclusions, uncertainty, and activation
floors are chosen from the construct and statistical plan. An API balance,
operator spending preference, or runner cap must not reduce those requirements
or redefine an incomplete campaign as sufficient evidence.

Execution funding is an Eval/operator concern. Before a live campaign, the
operator authorizes a bounded run profile and verifies that available provider
funding can cover that profile. Insufficient funding stops or defers execution
with an explicit unavailable or incomplete state; it does not alter benchmark
design. Activation has no fixed dollar-price criterion, although observed
operational cost is reported as feasibility evidence.

The experimental live-judge contract has exactly two slots: `gpt-5.6-terra`
and `gpt-5.6-luna`. An ordinary atom requests each slot once; only malformed
structured output receives one retry, so no atom makes more than four provider
requests. Both valid non-critical votes must agree for an ordinary result;
either disagreement is a tie, and a critical failure requires both slots. A
deterministic-verifier failure prevents all provider calls. The current
`2026.8.12` manual execution profile is sequential and preflights exact atom
count plus independently measured request maxima under its operator-authorized
USD 50 (`50,000,000,000` nano-USD) guardrail. That amount is run authority, not
a construct, sample-size, validity, or activation requirement. The runner
records only digests and token/cost fields, stops on unavailable or invalid
usage, and never records raw prompts, responses, or credentials.

## Verification and implementation status

Task 1 projects the confirmed design and implements the deterministic inactive
boundary. Its checker and fixture tests establish only the following local
contract: allowed role roots are experimental; measured artifacts, active
claims, and candidate/Product-specific source imports are rejected. The
subsequent implementation plan is
[`../plans/2026-08-12-pcda-benchmark-activation.md`](../plans/2026-08-12-pcda-benchmark-activation.md).

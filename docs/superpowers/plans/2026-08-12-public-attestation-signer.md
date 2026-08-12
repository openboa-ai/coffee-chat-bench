# Public Attestation Signer Plan

**Goal:** Let the trusted Eval host authenticate verifier evidence through a
bounded Bench CLI without importing Bench source or reproducing canonical MAC
logic.

## Contract

- `attest <unsigned-attestation> <signed-attestation>` is the only new surface.
- The 32-byte base64url capability enters through
  `COFFEE_CHAT_EVAL_ATTESTATION_KEY`, is deleted immediately, and never appears
  in argv, stdout, or the signed document.
- Input must be an unsigned isolated-verifier attestation. Existing MACs and
  an existing output path are rejected.
- The output is created exclusively with owner-only permissions. The CLI emits
  only a bounded success state; `judge` remains the authority that validates
  the complete attestation and benchmark binding.

## Verification

- Prove a CLI-created MAC is accepted by the canonical verifier.
- Prove pre-signed input, invalid capability, output overwrite, and secret
  serialization fail closed.
- Run the full deterministic suite, typecheck, format, and inactive-boundary
  checks. No provider call is permitted.

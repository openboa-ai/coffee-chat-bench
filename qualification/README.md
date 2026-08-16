# Judge qualification package

## Status

The fixed qualification-study files pass the repository's structural and digest
contracts, but no human annotations or model-qualification records have been
collected. Repository status remains `not_active`.

`study.json` binds the four `judge_qualification` families, 32 synthetic
artifacts, 88 blind judgment items, six disjoint annotation groups, the two
primary judge models, one cross-validation judge, and prospective acceptance
thresholds. Project-agent
construction hypotheses are included only to audit study construction. They
are removed from every annotation projection and are not criterion evidence.

No annotations file is shipped until genuine records exist. A fake, replayed,
model-authored, or example annotation must not be placed in this directory or
described as collected evidence.

## Intended workflow

1. Freeze this repository commit and `studyDigest`.
2. Admit six independent annotators through the excluded practice procedure,
   then give each exactly one generated group packet.
3. Collect one record for every assigned item using the exact protocol.
4. Derive the high-consensus human-reference subset while preserving missing,
   abstained, disagreeing, and orientation-inconsistent items.
5. Run both primary judges and the Sol cross-validation judge against only the
   measured references using an Eval-owned provider transport.
6. Re-derive the criterion from the same raw human records, derive qualification
   evidence for every configured model, derive the bound runtime judge
   configuration from that exact qualified report, and submit the records to the
   activation audit.

The TypeScript module validates bindings and computes evidence states. It
cannot prove that a human attestation is truthful, recruit annotators, or turn
missing evidence into qualification.

For an evidence audit, the repository exposes the same derivation boundary as
an offline CLI. It accepts only the frozen study, validated bank, raw human
records, and Eval-produced judge votes:

```bash
node --experimental-strip-types src/cli.ts qualification \
  --study qualification/study.json \
  --bank bank \
  --annotations /path/to/human-annotations.json \
  --votes /path/to/judge-votes.json
```

The command returns the human criterion and judge-qualification evidence. Empty
or incomplete inputs remain `incomplete`/`unavailable`; the command never
creates a score, activates the benchmark, or treats model-authored records as
human evidence. Provider calls and credential handling remain Eval-owned.

The runtime configuration is not an arbitrary list of model digests. Each
accepted model record digest-binds the release, frozen judge protocol,
`studyDigest`, exact model identity, and its qualification-evidence digest.
Changing any of those fields invalidates the configuration; evidence from an
earlier protocol or another study has no compatibility path.

Qualification authority is process-local and intentionally does not survive
JSON serialization. A new evaluator process must reload the frozen study, bank,
raw human records, and model votes, then derive the report and configuration
again. A serialized configuration object alone is not judge authority.

See [the annotation and qualification protocol](PROTOCOL.md) and
[the excluded practice procedure](PRACTICE.md) for the frozen procedure.

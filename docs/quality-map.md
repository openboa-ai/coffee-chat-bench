# Coffee Chat Bench Quality Map

## Scope

The current scope is governance, deferred activation criteria, and the
`not_active` no-claim boundary. It has no activation evidence and makes no
validity claim.

## Quality objective

Keep the machine-stable inactive boundary observable while assigning semantic
decisions to exact-head review.

| Property | Primary oracle | Honest evidence boundary |
| --- | --- | --- |
| Tracked-path boundary, canonical `not_active` markers, and bounded syntax tripwires | Deterministic checker and Node tests | Local/PR contract evidence only |
| Workflow self-change semantics, hidden executable behavior inside approved control modules, and natural-language claim meaning | Exact-head Codex review | Semantic review of the complete changed surface and execution graph |

Native auto-merge is enabled only after Codex review of the exact current head
is complete and all material review conversations are resolved. Passing local
CI does not make the repository active, establish validity, or replace that
semantic review.

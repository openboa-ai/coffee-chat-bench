# Coffee Chat Bench Quality Map

## Scope

The current scope is governance, deferred activation criteria, and the
`not_active` no-claim boundary. It has no activation evidence and makes no
validity claim.

## Quality objective

Prevent this trust base from acquiring an unapproved benchmark-bearing or
executable surface before an explicit activation decision.

| Failure mode | Observable oracle | Evidence tier |
| --- | --- | --- |
| A prohibited surface enters the repository. | `node scripts/check-inactive-boundary.mjs --root .` rejects it. | Local contract evidence |
| The absence boundary stops rejecting a prohibited surface. | `node --test tests/inactive-boundary.test.mjs` fails. | Local contract evidence |
| CI is mistaken for activation. | Public documentation retains `not_active` and no-claim wording. | Documentation boundary |

Passing any listed command proves only the named local contract. It does not
make the repository active or establish validity.

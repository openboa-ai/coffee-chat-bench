# Coffee Chat Bench Quality Map

## Scope

The current scope is governance, documentation, and the `not_active` boundary.
It has no activation evidence and makes no validity claim.

## Quality objective

Prevent this trust base from acquiring an unapproved executable or claim-bearing
surface before an explicit activation decision.

| Failure mode                                                            | Observable oracle                                                | Evidence tier             |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------- |
| A prohibited surface enters the repository.                             | `npm run inactive:check` rejects it.                             | Local contract evidence   |
| A governance workflow widens authority or suppresses required evidence. | `npm test` verifies the workflow contract.                       | Local contract evidence   |
| CI is mistaken for activation.                                          | README, AGENTS, and the activation criteria retain `not_active`. | Documentation boundary    |
| Migration evidence drifts from the reviewed tree.                       | `npm run ci:policy` recomputes the scoped receipt.               | Local provenance evidence |

Passing any listed command proves only the named local contract. It does not
make the repository active or establish validity.

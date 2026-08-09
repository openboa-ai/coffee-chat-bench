# Coffee Chat Bench repository rules

This repository is the official candidate-independent benchmark owner for Coffee
Chat. Its current repository status is `not_active`.

## Inactive boundary

- This trust base owns documentation, governance, activation criteria, and an
  executable absence boundary only.
- It does not provide an active benchmark or any executable measurement
  material.
- Passing CI verifies governance and the inactive boundary only. It does not
  establish benchmark validity or activate the repository.
- The validity documentation may describe future evidence requirements, but it
  may not establish a concrete construct.

## Change and security rules

- Every substantive change uses a pull request and squash merge.
- Human approval is not required. Sensitive paths require their applicable
  automated policy, security, and contract evidence before merge.
- Preserve explicit failure states. Do not turn missing, invalid, unavailable,
  or skipped evidence into success.
- Run format, type, test, inactive-boundary, and policy commands for changed
  surfaces. Do not weaken a check to imply activation.

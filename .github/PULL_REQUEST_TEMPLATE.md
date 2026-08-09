## Scope

Describe the repository-owned boundary and why it belongs here.

## Evidence

- [ ] `node scripts/check-inactive-boundary.mjs --root .`
- [ ] `node --test tests/inactive-boundary.test.mjs`
- [ ] The inactive status remains explicit unless this is an approved activation
      change.

## Protected-path evidence

- [ ] I identified any protected paths and ran their applicable automated
      policy and security checks.

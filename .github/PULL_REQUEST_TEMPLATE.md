## Scope

Describe the repository-owned boundary and why it belongs here.

## Evidence

- [ ] `node scripts/check-inactive-boundary.mjs --root .`
- [ ] `node --test tests/inactive-boundary.test.mjs`
- [ ] The inactive status remains explicit unless this is an approved activation
      change.

- [ ] `npm run format:check`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run ci:policy`

## Merge lifecycle

- [ ] I marked the applicable Sensitive path status below.
  - [ ] No sensitive path changed.
  - [ ] Sensitive path changed: explain the governance, judge, workflow, or
        Harbor boundary affected.
- [ ] GitHub-native squash auto-merge is enabled only after required checks
      pass. The external ruleset decides whether human review is required.

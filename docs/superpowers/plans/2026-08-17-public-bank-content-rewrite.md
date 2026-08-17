# Public Bank Content Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the template-grade public bank with 8 coherent matched
judgment-policy pairs, 128 evidence-bearing history records, and 32 complete
held-out agent tasks.

**Architecture:** Keep the current public/evaluator manifest boundary and the
fixed 8/16/32/96 census. Simplify `scripts/build-bank.mjs` around explicit
history and task objects, rotate case domains and task shapes, regenerate the
committed bank, and use only a few objective tests while semantic admission is
performed by direct pair-by-pair reading.

**Tech Stack:** Node.js, TypeScript contracts, JSON manifests, Node test runner,
Prettier.

## Global Constraints

- Repository status remains `not_active`.
- Candidate scope remains agent systems only.
- There is one public benchmark bank with three conditions.
- Public task input never includes hidden policy or evaluator criterion.
- Every case contains substantive evidence; no generic evidence fallback.
- Boundary cases require A/B convergence.
- No AI judge, candidate score, result, or leaderboard is implemented here.
- CalVer remains `2026.8.17`; no compatibility layer is introduced.

---

### Task 1: Fix the observable content contract

**Files:**
- Modify: `tests/public-bank.test.ts`

**Interfaces:**
- Consumes: `validateBank("bank")`
- Produces: objective evidence-completeness, cross-domain, and boundary
  convergence expectations for the generated bank

- [ ] **Step 1: Write the failing tests**

```ts
test("each pair transfers across four domains with complete evidence", async () => {
  const bank = await validateBank("bank");
  for (const cases of Map.groupBy(bank.cases, ({ entry }) => entry.pairId).values()) {
    assert.equal(new Set(cases.map(({ manifest }) => manifest.domain)).size, 4);
    assert.ok(cases.every(({ manifest }) => manifest.evidence.length >= 3));
  }
});

test("boundary cases converge while other held-out cases discriminate", async () => {
  const bank = await validateBank("bank");
  for (const { manifest, evaluator } of bank.cases) {
    const same = JSON.stringify(evaluator.criterion.expectedDecisionFeatures.target_a) ===
      JSON.stringify(evaluator.criterion.expectedDecisionFeatures.target_b);
    assert.equal(same, manifest.transferType === "boundary");
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-strip-types --test tests/public-bank.test.ts`
Expected: FAIL because current pairs use one domain, 31 cases contain only two
placeholder evidence items, and boundary criteria diverge.

### Task 2: Simplify the authored-data generator

**Files:**
- Modify: `scripts/build-bank.mjs`
- Modify: `src/data-audit.ts`

**Interfaces:**
- Consumes: explicit pair objects with evidence-bearing histories and complete
  task objects
- Produces: `bank/public/cases/*.json`, `bank/evaluator/cases/*.json`,
  `bank/sampling-plan.json`, and `bank/bank.json`

- [ ] **Step 1: Replace positional arrays and fallback evidence**

Use explicit task objects:

```js
{
  transferType,
  domain,
  form,
  taskMode,
  taskArchetype,
  title,
  instruction,
  evidence,
  targetA,
  targetB,
  reasoning,
  alternatives,
  performance,
  grounding,
  failures,
}
```

Use explicit history objects containing `situation`, two concrete evidence
facts, A/B decisions, and optional A/B rationales. Remove the generic evidence
fallback, generated rationale bank, and shared-decision lookup.

- [ ] **Step 2: Make sampling case-owned by domain**

Store `domain` on every sampling-plan case rather than assuming one domain per
pair. Update `src/data-audit.ts` to compare the case-owned domain without adding
new semantic scoring rules.

- [ ] **Step 3: Keep generated content deterministic**

Run: `node --experimental-strip-types scripts/build-bank.mjs bank`
Expected: deterministic JSON output with 32 public and 32 evaluator cases.

### Task 3: Author all eight matched policy pairs

**Files:**
- Modify: `scripts/build-bank.mjs`
- Regenerate: `bank/public/cases/*.json`
- Regenerate: `bank/evaluator/cases/*.json`
- Regenerate: `bank/sampling-plan.json`
- Regenerate: `bank/bank.json`

**Interfaces:**
- Consumes: the approved content design
- Produces: 128 matched history records and 32 complete held-out cases

- [ ] **Step 1: Rewrite pairs 01-04**

Author reversible-learning/coordinated-commitment,
diagnostic/reproducibility, participatory/accountable-delegation, and
service-floor/aggregate-reach pairs. Each pair receives five diagnostic
records, two true veto records, one neutral distractor, and four tasks in four
different domains.

- [ ] **Step 2: Rewrite pairs 05-08**

Author defense-in-depth/rapid-containment, source-fidelity/audience-learning,
learner-agency/mastery-progression, and diversification/concentrated-commitment
pairs under the same content contract.

- [ ] **Step 3: Regenerate and run GREEN**

Run:

```bash
node --experimental-strip-types scripts/build-bank.mjs bank
node --experimental-strip-types --test tests/public-bank.test.ts
```

Expected: PASS.

### Task 4: Perform direct semantic admission

**Files:**
- Modify when needed: `scripts/build-bank.mjs`
- Modify: `docs/validity/bank-development-review.md`

**Interfaces:**
- Consumes: all eight generated pair sets
- Produces: a concise, inspectable author review and corrected data

- [ ] **Step 1: Read each pair as one case set**

For every pair, inspect the 16 matched history decisions and four held-out
tasks against the seven questions in the approved content design. Reject and
rewrite any pair with missing facts, a globally superior target, phrase-copying
shortcuts, an inactive veto, or overlapping A/B directions.

- [ ] **Step 2: Record concrete review outcomes**

Document pair-level strengths, corrected defects, remaining limitations, and
the fact that this is author construction review rather than human criterion
annotation or construct validity.

### Task 5: Synchronize documentation and verify

**Files:**
- Modify: `README.md`
- Modify: `DATA-CARD.md`
- Modify: `docs/benchmark-design.md`
- Modify: `docs/implementation-plan.md`
- Modify: `docs/validity/activation-evidence.json`
- Modify: `OVERLAP-REPORT.json`
- Modify: provenance records only where generated paths or digests change

**Interfaces:**
- Consumes: final bank digest and direct-review outcome
- Produces: an internally consistent, still-inactive repository

- [ ] **Step 1: Update claims and digest bindings**

Describe the cross-domain matrix, complete evidence packets, actual boundary
convergence, and author-review limit without claiming judge or human validity.

- [ ] **Step 2: Run the full verification suite**

```bash
npm run data:audit
npm run format:check
npm run typecheck
npm run check:inactive
npm test
npm run ci:policy
git diff --check
```

Expected: all commands pass and the repository remains `not_active`.

- [ ] **Step 3: Commit the content rewrite**

```bash
git add -A
git commit -m "data(bench): rewrite the public judgment-history bank"
```

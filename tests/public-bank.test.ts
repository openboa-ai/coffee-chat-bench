import assert from "node:assert/strict";
import test from "node:test";

import { validateBank } from "../src/bank.ts";
import { auditBank } from "../src/data-audit.ts";

test("the canonical public bank has the fixed input census", async () => {
  const bank = await validateBank("bank");
  assert.equal(bank.manifest.status, "not_active");
  assert.equal("split" in bank.manifest, false);
  assert.equal(bank.cases.length, 32);
  assert.equal(new Set(bank.cases.map(({ entry }) => entry.pairId)).size, 8);
  assert.ok(bank.cases.every(({ manifest }) => !("split" in manifest)));
  assert.ok(
    bank.cases.every(
      ({ manifest }) =>
        manifest.documents.length >= 4 && manifest.documents.length <= 12,
    ),
  );
  assert.deepEqual(
    Object.fromEntries(
      [...Map.groupBy(bank.cases, ({ manifest }) => manifest.domain)]
        .map(([domain, cases]) => [domain, cases.length])
        .sort(),
    ),
    {
      editorial_creative_strategy: 4,
      education_coaching: 4,
      organizational_design: 4,
      product_service_operations: 4,
      procurement_portfolio_allocation: 4,
      public_resource_allocation: 4,
      scientific_technical_investigation: 4,
      security_reliability: 4,
    },
  );
  assert.ok(
    bank.cases.every(({ entry }) => entry.casePath.startsWith("public/cases/")),
  );
});

test("each pair spans the fixed transfer, form, mode, and archetype cells", async () => {
  const bank = await validateBank("bank");
  for (const cases of Map.groupBy(
    bank.cases,
    ({ entry }) => entry.pairId,
  ).values()) {
    assert.equal(cases.length, 4);
    assert.deepEqual(
      Object.fromEntries(
        [...Map.groupBy(cases, ({ manifest }) => manifest.transferType)]
          .map(([value, group]) => [value, group.length])
          .sort(),
      ),
      {
        boundary_condition: 1,
        cue_conflict: 1,
        far_transfer: 1,
        near_transfer: 1,
      },
    );
    assert.deepEqual(
      Object.fromEntries(
        [...Map.groupBy(cases, ({ manifest }) => manifest.form)]
          .map(([value, group]) => [value, group.length])
          .sort(),
      ),
      { dialogue: 2, professional_artifact: 2 },
    );
    assert.deepEqual(
      Object.fromEntries(
        [...Map.groupBy(cases, ({ manifest }) => manifest.taskArchetype)]
          .map(([value, group]) => [value, group.length])
          .sort(),
      ),
      {
        allocation_prioritization: 1,
        critique_revision: 1,
        design_threshold: 1,
        recommendation: 1,
      },
    );
  }
});

test("a public case is self-contained and has no evaluator-only material", async () => {
  const bank = await validateBank("bank");
  for (const { manifest } of bank.cases) {
    assert.deepEqual(
      Object.keys(manifest).filter((key) =>
        /criterion|hiddenPolicy|expectedScore|templateId/u.test(key),
      ),
      [],
    );
    assert.equal(manifest.lineage.sourceIds.length, manifest.documents.length);
    assert.ok(
      manifest.task.output.requiredReferenceIds.every((id) =>
        manifest.documents.some((document) => document.documentId === id),
      ),
    );
    assert.equal(manifest.contexts.unconditioned.length, 0);
    assert.equal(manifest.contexts.target_a.length, 8);
    assert.equal(manifest.contexts.target_b.length, 8);
  }
});

test("data audit is an inspectable passing construction gate", async () => {
  const report = await auditBank("bank");
  assert.equal(report.status, "passed", JSON.stringify(report));
  assert.deepEqual(report.census, {
    pairs: 8,
    targets: 16,
    historyRecordsPerTarget: 8,
    caseFamilies: 32,
    conditions: 3,
    agentExecutions: 96,
  });
  assert.ok(Object.values(report.checks).every(Boolean));
});

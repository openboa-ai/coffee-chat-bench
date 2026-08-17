import assert from "node:assert/strict";
import test from "node:test";

import { validateBank } from "../src/bank.ts";
import { auditBank } from "../src/data-audit.ts";

test("the canonical public bank has the fixed census and balanced cells", async () => {
  const bank = await validateBank("bank");
  assert.equal(bank.manifest.status, "not_active");
  assert.equal(bank.cases.length, 32);
  assert.equal(new Set(bank.cases.map(({ entry }) => entry.pairId)).size, 8);
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
    bank.cases.every(
      ({ evaluator }) => evaluator.criterion.humanReviewed === false,
    ),
  );
  assert.ok(
    bank.cases.every(
      ({ evaluator }) =>
        evaluator.criterion.authority === "project_author_hypothesis",
    ),
  );
});

test("each pair transfers across four domains with complete evidence", async () => {
  const bank = await validateBank("bank");
  for (const cases of Map.groupBy(
    bank.cases,
    ({ entry }) => entry.pairId,
  ).values()) {
    assert.equal(new Set(cases.map(({ manifest }) => manifest.domain)).size, 4);
    assert.ok(
      cases.every(({ manifest }) => manifest.evidence.length >= 3),
      cases.map(({ manifest }) => manifest.caseId).join(", "),
    );
  }
});

test("boundary cases converge while other held-out cases discriminate", async () => {
  const bank = await validateBank("bank");
  for (const { manifest, evaluator } of bank.cases) {
    const same =
      JSON.stringify(evaluator.criterion.expectedDecisionFeatures.target_a) ===
      JSON.stringify(evaluator.criterion.expectedDecisionFeatures.target_b);
    assert.equal(same, manifest.transferType === "boundary", manifest.caseId);
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

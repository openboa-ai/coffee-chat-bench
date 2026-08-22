import assert from "node:assert/strict";
import test from "node:test";

import {
  campaignIsCompatible,
  metricsBelongToCampaign,
} from "../scripts/qualification-campaign-integrity.mjs";

const expected = {
  measurementPlanDigest: "sha256:plan",
  gatePolicyId: "absolute-gate",
  gatePolicyDigest: "sha256:policy-a",
};

test("campaign compatibility binds both gate policy identity and content", () => {
  assert.equal(campaignIsCompatible({ ...expected }, expected), true);
  assert.equal(
    campaignIsCompatible(
      { ...expected, gatePolicyDigest: "sha256:policy-b" },
      expected,
    ),
    false,
  );
  assert.equal(
    campaignIsCompatible(
      {
        measurementPlanDigest: expected.measurementPlanDigest,
        gatePolicyId: expected.gatePolicyId,
      },
      expected,
    ),
    false,
  );
});

test("history accepts metrics only from the exact measurement and gate policy", () => {
  assert.equal(metricsBelongToCampaign({ ...expected }, expected), true);
  assert.equal(
    metricsBelongToCampaign(
      { ...expected, gatePolicyDigest: "sha256:policy-b" },
      expected,
    ),
    false,
  );
  assert.equal(
    metricsBelongToCampaign(
      {
        gatePolicyId: expected.gatePolicyId,
        measurementPlanDigest: expected.measurementPlanDigest,
      },
      expected,
    ),
    false,
  );
});

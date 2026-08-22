import assert from "node:assert/strict";
import test from "node:test";

import {
  assertFullIterationAvailable,
  assertMiniBatchAvailable,
  budgetUsed,
  latestFullStepId,
  miniBatchesSinceFull,
} from "../scripts/hill-climbing-policy.mjs";

const policy = {
  fullIterationBudget: 100,
  miniBatchLimitBetweenFull: 4,
};

test("baseline does not consume the full iteration budget", () => {
  const steps = [
    { stepId: "0000", gateDecision: "baseline" },
    { stepId: "0001", gateDecision: "rejected" },
    { stepId: "0002", gateDecision: "accepted" },
    { stepId: "mini-0001", runKind: "mini", gateDecision: "mini" },
  ];

  assert.equal(budgetUsed(steps), 2);
  assert.deepEqual(assertFullIterationAvailable(steps, policy), {
    used: 2,
    remaining: 98,
  });
  assert.equal(latestFullStepId(steps), "0002");
});

test("the fifth mini batch between full steps is rejected", () => {
  const miniSteps = [
    { stepId: "m1", parentFullStepId: "0000" },
    { stepId: "m2", parentFullStepId: "0000" },
    { stepId: "m3", parentFullStepId: "0000" },
    { stepId: "m4", parentFullStepId: "0000" },
    { stepId: "other", parentFullStepId: "0001" },
  ];

  assert.equal(miniBatchesSinceFull(miniSteps, "0000"), 4);
  assert.throws(
    () => assertMiniBatchAvailable(miniSteps, "0000", policy),
    /mini batch limit exhausted \(4\/4\)/u,
  );
  assert.deepEqual(assertMiniBatchAvailable(miniSteps, "0001", policy), {
    used: 1,
    remaining: 3,
  });
});

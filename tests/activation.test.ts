import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVATION_GATES,
  createActivationAudit,
  parseActivationAuditInput,
  parseActivationAudit,
  type ActivationGateEvidence,
} from "../src/activation.ts";
import { RELEASE_ID, stableDigest } from "../src/contracts.ts";

function gates(
  overrides: Partial<
    Record<(typeof ACTIVATION_GATES)[number], ActivationGateEvidence>
  > = {},
) {
  return Object.fromEntries(
    ACTIVATION_GATES.map((gate) => [
      gate,
      overrides[gate] ?? {
        state: "passed" as const,
        source: `evidence/${gate}.json`,
        note: `${gate} evidence is available`,
      },
    ]),
  ) as Record<(typeof ACTIVATION_GATES)[number], ActivationGateEvidence>;
}

test("activation audit preserves missing evidence and blocks readiness", () => {
  const input = {
    release: RELEASE_ID,
    bankDigest: stableDigest({ bank: "fixture" }),
    gates: gates({
      humanCriterion: {
        state: "missing",
        source: "qualification/README.md",
        note: "No independent human labels have been collected.",
      },
      reliability: {
        state: "unavailable",
        source: "docs/validity/validity-argument-and-evidence-plan.md",
        note: "Reliability study is not run.",
      },
      contamination: {
        state: "inconclusive",
        source: "CONTAMINATION.jsonl",
        note: "Training inclusion is unknown; no secrecy claim is made.",
      },
    }),
  };

  const audit = createActivationAudit(input);
  assert.equal(audit.repositoryStatus, "not_active");
  assert.equal(audit.decision, "not_ready");
  assert.deepEqual(audit.blockers, [
    "humanCriterion",
    "reliability",
    "contamination",
  ]);
  assert.equal(audit.gates.humanCriterion.state, "missing");
  assert.equal(audit.gates.reliability.state, "unavailable");
  assert.equal(audit.gates.contamination.state, "inconclusive");
  assert.deepEqual(parseActivationAudit(audit), audit);
  assert.deepEqual(parseActivationAuditInput(input), input);
});

test("activation audit only becomes ready for review when every gate passes", () => {
  const audit = createActivationAudit({
    release: RELEASE_ID,
    bankDigest: stableDigest({ bank: "qualified-fixture" }),
    gates: gates(),
  });

  assert.equal(audit.decision, "ready_for_review");
  assert.deepEqual(audit.blockers, []);
  assert.equal(audit.repositoryStatus, "not_active");
});

test("activation audit rejects an incomplete or tampered evidence manifest", () => {
  const input = {
    release: RELEASE_ID,
    bankDigest: stableDigest({ bank: "fixture" }),
    gates: gates(),
  };

  assert.throws(
    () =>
      parseActivationAuditInput({
        ...input,
        gates: { ...input.gates, validity: undefined },
      }),
    /activation\.gates\.validity must be an object/u,
  );

  const audit = createActivationAudit(input);
  assert.throws(
    () =>
      parseActivationAudit({ ...audit, auditDigest: stableDigest("tampered") }),
    /activation audit digest or decision is invalid/u,
  );
});

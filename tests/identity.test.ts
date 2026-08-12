import assert from "node:assert/strict";
import test from "node:test";

import { createTrialIdentity, stableDigest } from "../src/identity.ts";
import type { TrialIdentityInput } from "../src/identity.ts";

const trial = {
  release: "2026.8.12",
  benchmarkCommit: "0123456789abcdef0123456789abcdef01234567",
  bankDigest: `sha256:${"b".repeat(64)}`,
  caseId: "case-alpha",
  condition: "T1-A",
  candidateDigest: `sha256:${"c".repeat(64)}`,
  harnessDigest: `sha256:${"d".repeat(64)}`,
  modelDigest: `sha256:${"f".repeat(64)}`,
  hostDigest: `sha256:${"e".repeat(64)}`,
  repetition: 0,
} as const;

test("stable digest canonicalizes object key order to a literal SHA-256", () => {
  assert.equal(
    stableDigest({ b: 2, a: 1 }),
    "sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
  );
});

test("trial identity covers the complete public execution tuple", () => {
  assert.equal(
    createTrialIdentity(trial),
    "trial-a219b190f9af6daaf2e7f136f5590c2ccc3bbf48650b38107919fe1d24ef31c6",
  );
  assert.notEqual(
    createTrialIdentity({ ...trial, condition: "T1-B" }),
    createTrialIdentity(trial),
  );
  assert.notEqual(
    createTrialIdentity({ ...trial, repetition: 1 }),
    createTrialIdentity(trial),
  );
});

test("stable identities reject non-JSON and malformed identity values", () => {
  assert.throws(() => stableDigest({ value: Number.NaN }), /finite/i);
  assert.throws(
    () =>
      createTrialIdentity({
        ...trial,
        bankDigest: "not-a-digest",
      } as unknown as TrialIdentityInput),
    /digest/i,
  );
  assert.throws(
    () =>
      createTrialIdentity({
        ...trial,
        condition: "CC",
      } as unknown as TrialIdentityInput),
    /condition/i,
  );
});

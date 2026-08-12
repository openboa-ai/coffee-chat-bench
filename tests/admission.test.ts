import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  ADMISSION_CHECK_NAMES,
  auditProspectiveBank,
  evaluateDraft,
  parseAdmissionRecord,
  parseDraftAdmissionInput,
  selectReleaseBank,
  type AdmissionRecord,
  type AdmissionChecks,
  type AdmissionProvenance,
  type DraftAdmissionInput,
} from "../src/admission.ts";
import type { CaseBundle } from "../src/contracts.ts";
import { stableDigest } from "../src/digest.ts";

const literalDraft = {
  release: "2026.8.12",
  caseId: "case-alpha",
  familyId: "family-alpha",
  domain: "writing",
  operation: "summarize",
  difficulty: "medium",
  task: {
    instruction: "Choose one region for each decision.",
    deliverable: "Return the declared decision manifest.",
  },
  evidence: [
    {
      ref: "source-alpha",
      content: "Synthetic evidence for alpha.",
      digest:
        "sha256:a98bb75cecc477dc58c38e07343deb099215454020159ce941083dcf56d822b1",
    },
  ],
  perspectives: {
    A: {
      id: "perspective-alpha-a",
      pairId: "perspective-pair-alpha",
      content: "Prefer direct treatment.",
      digest:
        "sha256:e4358b6d64a3dc70f7d14965c8745e94bc45782e9fc636c488315535148adbed",
    },
    B: {
      id: "perspective-alpha-b",
      pairId: "perspective-pair-alpha",
      content: "Prefer contextual treatment.",
      digest:
        "sha256:c895eb71e2d05d74a1756c560c619dd4683af3fa93b055a2c202839c9bc7a6cd",
    },
    irrelevant: {
      id: "perspective-alpha-irrelevant",
      pairId: "perspective-pair-alpha-irrelevant",
      content: "Prefer concise updates.",
      digest:
        "sha256:948c34c9cd4b2b9aae443163e82c227ec9e7ad28597057c032cab8eff51a173c",
    },
  },
  decisions: [
    {
      decisionId: "sensitive-alpha",
      prompt: "Which treatment should be used?",
      regionOptions: ["draft", "direct", "contextual"],
      partition: "sensitive",
      acceptedRegions: {
        T0: ["draft"],
        "T1-A": ["direct"],
        "T1-B": ["contextual"],
      },
      requiredEvidenceRefs: ["source-alpha"],
    },
    {
      decisionId: "invariant-alpha",
      prompt: "Which evidence bound should be preserved?",
      regionOptions: ["cite", "bounded", "omit"],
      partition: "invariant",
      acceptedRegions: {
        T0: ["cite"],
        "T1-A": ["cite"],
        "T1-B": ["cite"],
      },
      requiredEvidenceRefs: ["source-alpha"],
    },
  ],
  nonGoal: "Do not invent sources.",
  sourceDigest:
    "sha256:a4d9b59bfc90e261b09d6b6d1acbe8230c2811d9d09ec19496b354624fcf957b",
} as const satisfies CaseBundle;

const passingChecks = {
  taskOnlyUnderdetermination: {
    passed: true,
    reason: "The task alone leaves both treatments supportable.",
  },
  perspectiveOnlyInsufficiency: {
    passed: true,
    reason: "The perspective alone cannot establish the evidence bound.",
  },
  counterfactualShift: {
    passed: true,
    reason: "A and B change the sensitive accepted region.",
  },
  locality: {
    passed: true,
    reason: "Only the declared sensitive decision changes.",
  },
  irrelevantStability: {
    passed: true,
    reason: "The irrelevant perspective preserves accepted regions.",
  },
  paraphraseInvariance: {
    passed: true,
    reason: "Declared paraphrases preserve the accepted regions.",
  },
  antiEcho: {
    passed: true,
    reason: "No visible input reproduces an accepted manifest.",
  },
  rights: {
    passed: true,
    reason: "The draft and perspectives are synthetic public material.",
  },
  deterministicOraclePass: {
    passed: true,
    reason: "The deterministic Oracle fixture is accepted.",
  },
  deterministicNoOpFailure: {
    passed: true,
    reason: "The deterministic no-op fixture is rejected.",
  },
  deterministicListAllFailure: {
    passed: true,
    reason: "The deterministic list-all fixture is rejected.",
  },
} as const satisfies AdmissionChecks;

const literalPassingInput = {
  release: "2026.8.12",
  draftId: "draft-alpha",
  partition: "development",
  draft: literalDraft,
  provenance: {
    authorModelId: "gpt-5.6-sol",
    criticModelId: "gpt-5.6-terra",
    adversaryModelId: "gpt-5.6-luna",
    decisiveModelId: "gpt-5.6-terra",
  },
  checks: passingChecks,
} as const satisfies DraftAdmissionInput;

test("admits a literal draft only when every named check passes", () => {
  const record = evaluateDraft(literalPassingInput);

  assert.equal(record.admitted, true);
  assert.deepEqual(record.reasons, []);
  assert.deepEqual(record.checks, passingChecks);
  assert.equal(record.draft.familyId, "family-alpha");
});

test("rejects every failed or missing named check without compensation", () => {
  for (const checkName of ADMISSION_CHECK_NAMES) {
    const checks = {
      ...passingChecks,
      [checkName]: {
        passed: false,
        reason: `literal failure for ${checkName}`,
      },
    };
    const record = evaluateDraft({ ...literalPassingInput, checks });

    assert.equal(record.admitted, false, checkName);
    assert.deepEqual(record.reasons, [
      `${checkName}: literal failure for ${checkName}`,
    ]);
  }

  const checksWithMissingAntiEcho = { ...passingChecks } as Partial<
    Record<keyof AdmissionChecks, AdmissionChecks[keyof AdmissionChecks]>
  >;
  delete checksWithMissingAntiEcho.antiEcho;
  assert.throws(
    () =>
      evaluateDraft({
        ...literalPassingInput,
        checks: checksWithMissingAntiEcho as AdmissionChecks,
      }),
    /checks.*exactly|antiEcho/i,
  );
});

test("rejects empty check reasons and invalid or duplicate model provenance", () => {
  assert.throws(
    () =>
      evaluateDraft({
        ...literalPassingInput,
        checks: {
          ...passingChecks,
          locality: { passed: true, reason: "" },
        },
      }),
    /locality.*reason/i,
  );

  assert.throws(
    () =>
      evaluateDraft({
        ...literalPassingInput,
        provenance: {
          ...literalPassingInput.provenance,
          authorModelId:
            "gpt-5.6-unknown" as AdmissionProvenance["authorModelId"],
        },
      }),
    /authorModelId/i,
  );
  const invalidProvenance: readonly AdmissionProvenance[] = [
    {
      ...literalPassingInput.provenance,
      criticModelId: "gpt-5.6-sol",
    },
    {
      ...literalPassingInput.provenance,
      decisiveModelId: "gpt-5.6-sol",
    },
  ];
  for (const provenance of invalidProvenance) {
    const record = evaluateDraft({ ...literalPassingInput, provenance });
    assert.equal(record.admitted, false);
    assert.match(record.reasons.join("\n"), /provenance|decisive/i);
  }
});

test("admission-record schema accepts explicit outcomes and rejects omitted checks or scores", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const caseSchema = JSON.parse(
    readFileSync(
      new URL("../schemas/case.schema.json", import.meta.url),
      "utf8",
    ),
  ) as object;
  const admissionSchema = JSON.parse(
    readFileSync(
      new URL("../schemas/admission-record.schema.json", import.meta.url),
      "utf8",
    ),
  ) as object;
  ajv.addSchema(caseSchema);
  const validate = ajv.compile(admissionSchema);
  const passed = evaluateDraft(literalPassingInput);
  const failed = evaluateDraft({
    ...literalPassingInput,
    draftId: "draft-alpha-rejected",
    checks: {
      ...passingChecks,
      antiEcho: { passed: false, reason: "The prompt echoes an option." },
    },
  });

  assert.equal(validate(passed), true, JSON.stringify(validate.errors));
  assert.equal(validate(failed), true, JSON.stringify(validate.errors));
  const { antiEcho: _antiEcho, ...incompleteChecks } = passed.checks;
  assert.equal(validate({ ...passed, checks: incompleteChecks }), false);
  assert.equal(validate({ ...passed, weightedScore: 1 }), false);
});

test("runtime admission parsers enforce exact keys in parity with the schema", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const caseSchema = JSON.parse(
    readFileSync(
      new URL("../schemas/case.schema.json", import.meta.url),
      "utf8",
    ),
  ) as object;
  const admissionSchema = JSON.parse(
    readFileSync(
      new URL("../schemas/admission-record.schema.json", import.meta.url),
      "utf8",
    ),
  ) as object;
  ajv.addSchema(caseSchema);
  const validate = ajv.compile(admissionSchema);
  const record = evaluateDraft(literalPassingInput);
  const unknownInput = { ...literalPassingInput, weightedScore: 1 };
  const unknownRecord = { ...record, weightedScore: 1 };
  const unknownModelRecord = {
    ...record,
    provenance: {
      ...record.provenance,
      authorModelId: "gpt-5.6-unknown",
    },
  };

  assert.deepEqual(
    parseDraftAdmissionInput(literalPassingInput),
    literalPassingInput,
  );
  assert.deepEqual(parseAdmissionRecord(record), record);
  assert.throws(
    () => parseDraftAdmissionInput(unknownInput),
    /exactly|weightedScore/i,
  );
  assert.throws(() => evaluateDraft(unknownInput), /exactly|weightedScore/i);
  assert.equal(validate(unknownRecord), false);
  assert.throws(
    () => parseAdmissionRecord(unknownRecord),
    /exactly|weightedScore/i,
  );
  assert.equal(validate(unknownModelRecord), false);
  assert.throws(
    () => parseAdmissionRecord(unknownModelRecord),
    /authorModelId/i,
  );
});

const campaignDomains = ["domain-a", "domain-b", "domain-c"] as const;
const campaignOperations = [
  "operation-a",
  "operation-b",
  "operation-c",
  "operation-d",
] as const;
const campaignDifficulties = ["standard", "hard"] as const;

function campaignRecord(index: number, admitted: boolean): AdmissionRecord {
  const admittedIndex = index % 96;
  const stratumIndex = Math.floor(admittedIndex / 4);
  const difficultyIndex = stratumIndex % 2;
  const operationIndex = Math.floor(stratumIndex / 2) % 4;
  const domainIndex = Math.floor(stratumIndex / 8) % 3;
  const pairIndex = operationIndex * 2 + difficultyIndex;
  const semanticDraft = {
    ...literalDraft,
    caseId: `case-${index.toString().padStart(3, "0")}`,
    familyId: `family-${index.toString().padStart(3, "0")}`,
    domain: campaignDomains[domainIndex],
    operation: campaignOperations[operationIndex],
    difficulty: campaignDifficulties[difficultyIndex],
    perspectives: {
      ...literalDraft.perspectives,
      A: {
        ...literalDraft.perspectives.A,
        id: `perspective-${index}-a`,
        pairId: `perspective-pair-${pairIndex}`,
      },
      B: {
        ...literalDraft.perspectives.B,
        id: `perspective-${index}-b`,
        pairId: `perspective-pair-${pairIndex}`,
      },
      irrelevant: {
        ...literalDraft.perspectives.irrelevant,
        id: `perspective-${index}-irrelevant`,
        pairId: `irrelevant-pair-${index}`,
      },
    },
  };
  const { sourceDigest: _sourceDigest, ...sourceFields } = semanticDraft;
  const draft = {
    ...sourceFields,
    sourceDigest: stableDigest(sourceFields),
  } as CaseBundle;
  const partition =
    admittedIndex < 24
      ? "development"
      : admittedIndex < 48
        ? "calibration"
        : admittedIndex < 88
          ? "release"
          : "bridge";
  return evaluateDraft({
    ...literalPassingInput,
    draftId: `draft-${index.toString().padStart(3, "0")}`,
    partition,
    draft,
    checks: admitted
      ? passingChecks
      : {
          ...passingChecks,
          antiEcho: {
            passed: false,
            reason: "The rejected draft echoes a visible option.",
          },
        },
  });
}

function literalCampaign(): readonly AdmissionRecord[] {
  return [
    ...Array.from({ length: 96 }, (_, index) => campaignRecord(index, true)),
    ...Array.from({ length: 48 }, (_, offset) =>
      campaignRecord(96 + offset, false),
    ),
  ];
}

test("audits all 144 records while enforcing the exact 96-family campaign", () => {
  const records = literalCampaign();
  const report = auditProspectiveBank({ release: "2026.8.12", records });

  assert.equal(report.state, "valid");
  assert.equal(report.records.length, 144);
  assert.deepEqual(report.records, records);
  assert.equal(report.admittedRecords.length, 96);
  assert.equal(report.rejectedRecords.length, 48);
  assert.deepEqual(report.partitionCounts, {
    development: 24,
    calibration: 24,
    release: 40,
    bridge: 8,
  });
  assert.deepEqual(report.dimensionCounts, {
    domains: 3,
    operations: 4,
    difficulties: 2,
    casesPerStratum: 4,
  });
  assert.equal(report.perspectivePairCount, 8);
  assert.equal(
    Object.values(report.checks).every((check) => check.passed),
    true,
  );
});

test("audit reports are identical regardless of prospective record order", () => {
  const records = literalCampaign();
  const reversed = [...records].reverse();

  assert.deepEqual(
    auditProspectiveBank({ release: "2026.8.12", records }),
    auditProspectiveBank({ release: "2026.8.12", records: reversed }),
  );
  assert.deepEqual(
    selectReleaseBank({ release: "2026.8.12", records }),
    selectReleaseBank({ release: "2026.8.12", records: reversed }),
  );
});

test("audit rejects over/under-sized campaigns and inconsistent record releases", () => {
  const records = literalCampaign();

  assert.equal(
    auditProspectiveBank({ release: "2026.8.12", records: records.slice(1) })
      .checks.prospectiveCount.passed,
    false,
  );
  assert.equal(
    auditProspectiveBank({
      release: "2026.8.12",
      records: [...records, campaignRecord(144, false)],
    }).checks.prospectiveCount.passed,
    false,
  );
  const wrongReleaseRecord = {
    ...records[0]!,
    release: "2026.8.13",
  } as unknown as AdmissionRecord;
  const inconsistent = auditProspectiveBank({
    release: "2026.8.12",
    records: [wrongReleaseRecord, ...records.slice(1)],
  });
  assert.equal(inconsistent.state, "invalid");
  assert.equal(inconsistent.checks.recordConsistency.passed, false);
});

test("selection rejects a campaign with 97 passed records instead of dropping one", () => {
  const records = [...literalCampaign()];
  records[96] = campaignRecord(96, true);

  const selected = selectReleaseBank({ release: "2026.8.12", records });
  const reversed = selectReleaseBank({
    release: "2026.8.12",
    records: [...records].reverse(),
  });

  assert.equal(selected.state, "invalid");
  assert.deepEqual(selected.selectedRecords, []);
  assert.equal(selected.checks.exactSelection.passed, false);
  assert.match(selected.reasons.join("\n"), /exactly 96 passed/i);
  assert.deepEqual(selected, reversed);
});

test("audit rejects duplicate case, family, or source identities in rejected records", () => {
  const records = [...literalCampaign()];
  const duplicateKinds = ["caseId", "familyId", "sourceDigest"] as const;

  for (const key of duplicateKinds) {
    const original = records[96]!;
    const changedDraft =
      key === "sourceDigest"
        ? records[0]!.draft
        : { ...original.draft, [key]: records[0]!.draft[key] };
    const { sourceDigest: _sourceDigest, ...semanticFields } = changedDraft;
    const duplicatedDraft =
      key === "sourceDigest"
        ? changedDraft
        : { ...semanticFields, sourceDigest: stableDigest(semanticFields) };
    records[96] = {
      ...original,
      draft: duplicatedDraft,
    };
    const report = auditProspectiveBank({ release: "2026.8.12", records });

    assert.equal(report.state, "invalid", key);
    assert.equal(report.records.length, 144, key);
    assert.equal(report.checks.identityUniqueness.passed, false, key);
    records[96] = original;
  }
});

test("returns an explicit invalid selection instead of a partial best effort", () => {
  const records = [...literalCampaign()];
  records[0] = campaignRecord(0, false);

  const selection = selectReleaseBank({ release: "2026.8.12", records });

  assert.equal(selection.state, "invalid");
  assert.deepEqual(selection.selectedRecords, []);
  assert.equal(selection.checks.exactSelection.passed, false);
  assert.match(selection.reasons.join("\n"), /exact|96|constraints/i);
});

test("audit and selection report malformed records by index without throwing", () => {
  const records: unknown[] = [...literalCampaign()];
  records[1] = { ...(records[1] as object), weightedScore: 1 };
  records[2] = null;

  const audit = auditProspectiveBank({ release: "2026.8.12", records });
  const selection = selectReleaseBank({ release: "2026.8.12", records });

  for (const report of [audit, selection]) {
    assert.equal(report.state, "invalid");
    assert.match(report.reasons.join("\n"), /records\[1\].*exactly/i);
    assert.match(report.reasons.join("\n"), /records\[2\].*plain object/i);
    assert.equal(JSON.stringify(report).includes("weightedScore"), false);
  }
  assert.equal(audit.records.length, 142);
  assert.deepEqual(selection.selectedRecords, []);
});

test("admit and audit-bank CLI commands emit the structural records and exit by state", () => {
  const root = mkdtempSync(join(tmpdir(), "coffee-chat-admission-cli-"));
  try {
    const draftFile = join(root, "draft.json");
    const campaignFile = join(root, "campaign.json");
    writeFileSync(draftFile, JSON.stringify(literalPassingInput), "utf8");
    writeFileSync(
      campaignFile,
      JSON.stringify({ release: "2026.8.12", records: literalCampaign() }),
      "utf8",
    );

    const admit = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "src/cli.ts", "admit", draftFile],
      { encoding: "utf8" },
    );
    const audit = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "src/cli.ts", "audit-bank", campaignFile],
      { encoding: "utf8" },
    );

    assert.equal(admit.status, 0, admit.stderr);
    assert.deepEqual(
      JSON.parse(admit.stdout),
      evaluateDraft(literalPassingInput),
    );
    assert.equal(audit.status, 0, audit.stderr);
    const auditReport = JSON.parse(audit.stdout) as {
      state: string;
      records: unknown[];
      rejectedRecords: unknown[];
    };
    assert.equal(auditReport.state, "valid");
    assert.equal(auditReport.records.length, 144);
    assert.equal(auditReport.rejectedRecords.length, 48);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI returns stable nonzero JSON for unknown admission fields and malformed campaigns", () => {
  const root = mkdtempSync(join(tmpdir(), "coffee-chat-admission-invalid-"));
  try {
    const draftFile = join(root, "draft.json");
    const campaignFile = join(root, "campaign.json");
    const malformedRecords: unknown[] = [...literalCampaign()];
    malformedRecords[4] = null;
    writeFileSync(
      draftFile,
      JSON.stringify({ ...literalPassingInput, weightedScore: 1 }),
      "utf8",
    );
    writeFileSync(
      campaignFile,
      JSON.stringify({ release: "2026.8.12", records: malformedRecords }),
      "utf8",
    );

    const run = (command: "admit" | "audit-bank", file: string) =>
      spawnSync(
        process.execPath,
        ["--experimental-strip-types", "src/cli.ts", command, file],
        { encoding: "utf8" },
      );
    const firstAdmit = run("admit", draftFile);
    const secondAdmit = run("admit", draftFile);
    const firstAudit = run("audit-bank", campaignFile);
    const secondAudit = run("audit-bank", campaignFile);

    assert.equal(firstAdmit.status, 1);
    assert.equal(firstAdmit.stdout, secondAdmit.stdout);
    assert.doesNotThrow(() => JSON.parse(firstAdmit.stdout));
    assert.equal(firstAdmit.stdout.includes("weightedScore"), false);
    assert.equal(firstAudit.status, 1);
    assert.equal(firstAudit.stdout, secondAudit.stdout);
    assert.match(firstAudit.stdout, /records\[4\].*plain object/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  auditProspectiveBank,
  parseAdmissionRecord,
  type AdmissionRecord,
} from "../src/admission.ts";
import { validateBank } from "../src/bank.ts";
import { caseSourceDigest, parseCaseBundle } from "../src/contracts.ts";
import { stableDigest } from "../src/digest.ts";
import {
  DOMAIN_BLUEPRINT_NAMES,
  PERSPECTIVE_PAIR_IDS,
  materializeCampaign,
  parseDomainBlueprint,
  parsePerspectiveCatalog,
} from "../src/materializer.ts";

const passingChecks = {
  taskOnlyUnderdetermination: {
    passed: true,
    reason: "The task leaves both sensitive options supportable.",
  },
  perspectiveOnlyInsufficiency: {
    passed: true,
    reason: "The perspective cannot establish the evidence obligation.",
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
    reason: "Meaning-preserving paraphrases preserve accepted regions.",
  },
  antiEcho: {
    passed: true,
    reason: "Visible inputs do not reproduce an accepted manifest.",
  },
  rights: {
    passed: true,
    reason: "The content is synthetic public MIT material.",
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
} as const;

const operations = [
  "operation-a",
  "operation-b",
  "operation-c",
  "operation-d",
] as const;
const difficulties = ["standard", "hard"] as const;

function semanticDraft(
  domain: (typeof DOMAIN_BLUEPRINT_NAMES)[number],
  index: number,
  intent: "admitted" | "rejected",
) {
  const id = index.toString().padStart(3, "0");
  const domainIndex = DOMAIN_BLUEPRINT_NAMES.indexOf(domain);
  const admittedIndex = domainIndex * 32 + index;
  const stratumIndex = Math.floor(index / 4) % 8;
  const operationIndex = Math.floor(stratumIndex / 2);
  const difficultyIndex = stratumIndex % 2;
  const partition =
    intent === "rejected"
      ? "development"
      : admittedIndex < 24
        ? "development"
        : admittedIndex < 48
          ? "calibration"
          : admittedIndex < 88
            ? "release"
            : "bridge";
  return {
    draftId: `draft-${domain}-${id}`,
    intent,
    partition,
    caseId: `case-${domain}-${id}`,
    familyId: `family-${domain}-${id}`,
    operation: operations[operationIndex],
    difficulty: difficulties[difficultyIndex],
    task: {
      instruction: `Choose bounded regions for synthetic ${domain} case ${id}.`,
      deliverable: "Return the declared decision manifest.",
    },
    evidence: {
      [`supporting-${domain}-${id}`]: `Additional synthetic public evidence for ${domain} case ${id}.`,
      [`evidence-${domain}-${id}`]: `Synthetic public evidence for ${domain} case ${id}.`,
    },
    perspectivePairId: PERSPECTIVE_PAIR_IDS[stratumIndex],
    decisions: [
      {
        decisionId: `sensitive-${domain}-${id}`,
        prompt: "Which perspective-sensitive region should be selected?",
        regionOptions: ["baseline", "a-region", "b-region"],
        partition: "sensitive",
        acceptedRegions: {
          T0: ["baseline"],
          "T1-A": ["a-region"],
          "T1-B": ["b-region"],
        },
        requiredEvidenceRefs: [`evidence-${domain}-${id}`],
      },
      {
        decisionId: `invariant-${domain}-${id}`,
        prompt: "Which evidence obligation must remain fixed?",
        regionOptions: ["cite", "omit"],
        partition: "invariant",
        acceptedRegions: {
          T0: ["cite"],
          "T1-A": ["cite"],
          "T1-B": ["cite"],
        },
        requiredEvidenceRefs: [`evidence-${domain}-${id}`],
      },
    ],
    nonGoal: "Do not infer facts outside the synthetic evidence.",
    provenance: {
      authorModelId: "gpt-5.6-sol",
      criticModelId: "gpt-5.6-terra",
      adversaryModelId: "gpt-5.6-luna",
      decisiveModelId: "gpt-5.6-terra",
    },
    checks:
      intent === "admitted"
        ? passingChecks
        : {
            ...passingChecks,
            antiEcho: {
              passed: false,
              reason: "The rejected draft echoes a visible option.",
            },
          },
  } as const;
}

function domainBlueprint() {
  return {
    release: "2026.8.12",
    domain: "product",
    drafts: Array.from({ length: 48 }, (_, index) =>
      semanticDraft("product", index, index < 32 ? "admitted" : "rejected"),
    ),
  };
}

function perspectiveCatalogSource(): unknown {
  return JSON.parse(
    readFileSync(
      new URL("../perspectives/catalog.json", import.meta.url),
      "utf8",
    ),
  ) as unknown;
}

function campaignBlueprints() {
  return DOMAIN_BLUEPRINT_NAMES.map((domain) => ({
    release: "2026.8.12" as const,
    domain,
    drafts: Array.from({ length: 48 }, (_, index) =>
      semanticDraft(domain, index, index < 32 ? "admitted" : "rejected"),
    ),
  }));
}

function treeBytes(root: string): Readonly<Record<string, string>> {
  const files: Record<string, string> = {};
  function visit(directory: string, prefix: string): void {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const relative = prefix.length === 0 ? name : `${prefix}/${name}`;
      if (lstatSync(path).isDirectory()) visit(path, relative);
      else files[relative] = readFileSync(path, "utf8");
    }
  }
  visit(root, "");
  return files;
}

test("catalog contains exactly the eight named neutral public contrast pairs", () => {
  const source = perspectiveCatalogSource();
  const catalog = parsePerspectiveCatalog(source);

  assert.deepEqual(
    catalog.pairs.map(({ pairId }) => pairId),
    PERSPECTIVE_PAIR_IDS,
  );
  assert.equal(catalog.pairs.length, 8);
  assert.equal(catalog.rights.license, "MIT");
  assert.equal(catalog.rights.synthetic, true);
  assert.equal(catalog.rights.public, true);
  assert.equal(catalog.rights.noUniversalPreference, true);
  assert.equal(
    catalog.pairs.every(
      (pair) =>
        pair.neitherSideUniversallySuperior &&
        pair.A.content.length > 0 &&
        pair.B.content.length > 0 &&
        pair.irrelevant.content.length > 0 &&
        pair.irrelevant.pairId !== pair.pairId,
    ),
    true,
  );

  assert.throws(
    () =>
      parsePerspectiveCatalog({
        ...(source as object),
        pairs: catalog.pairs.slice(1),
      }),
    /exactly.*8|named.*pairs/i,
  );
});

test("materializes a valid semantic campaign through existing validators and audit", () => {
  const root = mkdtempSync(join(tmpdir(), "coffee-chat-materializer-"));
  const destination = join(root, "bank");
  try {
    const result = materializeCampaign(
      {
        catalog: parsePerspectiveCatalog(perspectiveCatalogSource()),
        blueprints: campaignBlueprints().map(parseDomainBlueprint),
      },
      destination,
    );

    assert.equal(result.state, "valid");
    assert.equal(result.written, true);
    assert.deepEqual(result.counts, {
      prospective: 144,
      admitted: 96,
      rejected: 48,
      development: 24,
      calibration: 24,
      release: 40,
      bridge: 8,
    });

    const records = readFileSync(
      join(destination, "prospective", "admission-ledger.jsonl"),
      "utf8",
    )
      .trimEnd()
      .split("\n")
      .map((line) =>
        parseAdmissionRecord(JSON.parse(line)),
      ) satisfies AdmissionRecord[];
    const audit = auditProspectiveBank({ release: "2026.8.12", records });
    assert.equal(audit.state, "valid");
    assert.equal(records.length, 144);

    const first = records[0]!;
    const evidenceRefs = first.draft.evidence.map(({ ref }) => ref);
    assert.deepEqual(evidenceRefs, [...evidenceRefs].sort());
    assert.equal(
      first.draft.evidence[0]!.digest,
      stableDigest(first.draft.evidence[0]!.content),
    );
    assert.equal(
      first.draft.perspectives.A.digest,
      stableDigest(first.draft.perspectives.A.content),
    );
    assert.equal(first.draft.sourceDigest, caseSourceDigest(first.draft));
    assert.deepEqual(parseCaseBundle(first.draft), first.draft);

    let selectedCount = 0;
    for (const partition of [
      "development",
      "calibration",
      "release",
      "bridge",
    ]) {
      const partitionRoot = join(destination, partition);
      const files = readdirSync(partitionRoot);
      selectedCount += files.length;
      assert.equal(validateBank(partitionRoot).state, "valid", partition);
    }
    assert.equal(selectedCount, 96);

    const campaign = JSON.parse(
      readFileSync(join(destination, "campaign.json"), "utf8"),
    ) as {
      generated: boolean;
      prospectiveDigest: string;
      selectedBankDigest: string;
      auditState: string;
    };
    assert.equal(campaign.generated, true);
    assert.equal(campaign.prospectiveDigest, result.prospectiveDigest);
    assert.equal(campaign.selectedBankDigest, result.selectedBankDigest);
    assert.equal(campaign.auditState, "valid");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("materialized bytes are invariant to blueprint and draft traversal order", () => {
  const root = mkdtempSync(join(tmpdir(), "coffee-chat-determinism-"));
  const destination = join(root, "bank");
  try {
    const catalog = parsePerspectiveCatalog(perspectiveCatalogSource());
    const canonical = campaignBlueprints().map(parseDomainBlueprint);
    const first = materializeCampaign(
      { catalog, blueprints: canonical },
      destination,
    );
    const firstBytes = treeBytes(destination);
    const reordered = campaignBlueprints()
      .reverse()
      .map((blueprint) =>
        parseDomainBlueprint({
          ...blueprint,
          drafts: [...blueprint.drafts].reverse(),
        }),
      );

    const second = materializeCampaign(
      { catalog, blueprints: reordered },
      destination,
    );

    assert.deepEqual(second, first);
    assert.deepEqual(treeBytes(destination), firstBytes);
    assert.deepEqual(readdirSync(root), ["bank"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("invalid campaigns write nothing and generated replacement never touches unmanaged data", () => {
  const root = mkdtempSync(join(tmpdir(), "coffee-chat-atomicity-"));
  const destination = join(root, "bank");
  const unmanaged = join(root, "unmanaged");
  try {
    const catalog = parsePerspectiveCatalog(perspectiveCatalogSource());
    const validBlueprints = campaignBlueprints().map(parseDomainBlueprint);
    const invalidSources = campaignBlueprints();
    const rejected = invalidSources[0]!.drafts[32]!;
    invalidSources[0]!.drafts[32] = {
      ...rejected,
      checks: passingChecks,
    };
    const invalidBlueprints = invalidSources.map(parseDomainBlueprint);

    const absentResult = materializeCampaign(
      { catalog, blueprints: invalidBlueprints },
      destination,
    );
    assert.equal(absentResult.state, "invalid");
    assert.equal(absentResult.written, false);
    assert.equal(absentResult.counts.admitted, 97);
    assert.equal(existsSync(destination), false);

    materializeCampaign({ catalog, blueprints: validBlueprints }, destination);
    const validBytes = treeBytes(destination);
    const preservedResult = materializeCampaign(
      { catalog, blueprints: invalidBlueprints },
      destination,
    );
    assert.equal(preservedResult.state, "invalid");
    assert.deepEqual(treeBytes(destination), validBytes);

    mkdirSync(unmanaged);
    writeFileSync(join(unmanaged, "owner.txt"), "user-owned\n", "utf8");
    assert.throws(
      () =>
        materializeCampaign(
          { catalog, blueprints: validBlueprints },
          unmanaged,
        ),
      /not a generated.*destination/i,
    );
    assert.equal(
      readFileSync(join(unmanaged, "owner.txt"), "utf8"),
      "user-owned\n",
    );
    assert.deepEqual(readdirSync(root).sort(), ["bank", "unmanaged"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a symlinked destination ancestor without changing its target", () => {
  const root = mkdtempSync(join(tmpdir(), "coffee-chat-symlink-parent-"));
  const safeParent = join(root, "safe-parent");
  const target = join(root, "target");
  const linkedParent = join(safeParent, "linked-parent");
  const destination = join(linkedParent, "nested", "bank");
  try {
    mkdirSync(safeParent);
    mkdirSync(target);
    writeFileSync(join(target, "owner.txt"), "owner-controlled\n", "utf8");
    symlinkSync(target, linkedParent, "dir");
    const before = treeBytes(target);
    let error: unknown;

    try {
      materializeCampaign(
        {
          catalog: parsePerspectiveCatalog(perspectiveCatalogSource()),
          blueprints: campaignBlueprints().map(parseDomainBlueprint),
        },
        destination,
      );
    } catch (caught) {
      error = caught;
    }

    assert.deepEqual(
      {
        error:
          error instanceof Error &&
          /symbolic link.*ancestor/i.test(error.message),
        targetUnchanged:
          JSON.stringify(treeBytes(target)) === JSON.stringify(before),
      },
      { error: true, targetUnchanged: true },
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a symlink ancestor even when its target has existing descendants", () => {
  const root = mkdtempSync(join(tmpdir(), "coffee-chat-existing-symlink-"));
  const target = join(root, "target");
  const existing = join(target, "existing", "nested");
  const linkedParent = join(root, "linked-parent");
  const destination = join(linkedParent, "existing", "nested", "bank");
  try {
    mkdirSync(existing, { recursive: true });
    writeFileSync(join(existing, "owner.txt"), "owner-controlled\n", "utf8");
    symlinkSync(target, linkedParent, "dir");
    const before = treeBytes(target);

    assert.throws(
      () =>
        materializeCampaign(
          {
            catalog: parsePerspectiveCatalog(perspectiveCatalogSource()),
            blueprints: campaignBlueprints().map(parseDomainBlueprint),
          },
          destination,
        ),
      /symbolic link.*ancestor/i,
    );
    assert.deepEqual(treeBytes(target), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("domain blueprints use structural evidence maps and require 32/16 intent", () => {
  const blueprint = domainBlueprint();
  const parsed = parseDomainBlueprint(blueprint);

  assert.equal(parsed.drafts.length, 48);
  assert.equal(
    parsed.drafts.filter(({ intent }) => intent === "admitted").length,
    32,
  );
  assert.equal(
    parsed.drafts.filter(({ intent }) => intent === "rejected").length,
    16,
  );
  assert.deepEqual(parsed.drafts[0]!.evidence, {
    "supporting-product-000":
      "Additional synthetic public evidence for product case 000.",
    "evidence-product-000": "Synthetic public evidence for product case 000.",
  });

  const duplicateRef = "evidence-product-000";
  const structurallyUnique = Object.fromEntries([
    [duplicateRef, "first content"],
    [duplicateRef, "second content"],
  ]);
  assert.deepEqual(Object.entries(structurallyUnique), [
    [duplicateRef, "second content"],
  ]);

  assert.throws(
    () =>
      parseDomainBlueprint({
        ...blueprint,
        drafts: blueprint.drafts.map((draft, index) =>
          index === 0
            ? {
                ...draft,
                evidence: {
                  ...draft.evidence,
                  "evidence-product-000": {
                    content: "Synthetic public evidence for product case 000.",
                    digest: "sha256:author-controlled",
                  },
                },
              }
            : draft,
        ),
      }),
    /evidence.*non-empty string|digest/i,
  );
  assert.throws(
    () =>
      parseDomainBlueprint({
        ...blueprint,
        drafts: blueprint.drafts.map((draft, index) =>
          index === 0 ? { ...draft, admitted: true } : draft,
        ),
      }),
    /draft.*exactly|admitted/i,
  );
  assert.throws(
    () =>
      parseDomainBlueprint({
        ...blueprint,
        drafts: blueprint.drafts.map((draft, index) => ({
          ...draft,
          intent: index < 31 ? "admitted" : "rejected",
        })),
      }),
    /32 admitted.*16 rejected/i,
  );
});

test("Ajv and runtime parsers reject the same representative mutations", () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const catalogSchema = JSON.parse(
    readFileSync(
      new URL("../schemas/perspective-catalog.schema.json", import.meta.url),
      "utf8",
    ),
  ) as object;
  const blueprintSchema = JSON.parse(
    readFileSync(
      new URL("../schemas/domain-blueprint.schema.json", import.meta.url),
      "utf8",
    ),
  ) as object;
  const validateCatalog = ajv.compile(catalogSchema);
  const validateBlueprint = ajv.compile(blueprintSchema);
  const catalog = perspectiveCatalogSource();
  const blueprint = domainBlueprint();

  assert.equal(
    validateCatalog(catalog),
    true,
    JSON.stringify(validateCatalog.errors),
  );
  assert.equal(
    validateBlueprint(blueprint),
    true,
    JSON.stringify(validateBlueprint.errors),
  );
  assert.doesNotThrow(() => parsePerspectiveCatalog(catalog));
  assert.doesNotThrow(() => parseDomainBlueprint(blueprint));

  const parsedCatalog = parsePerspectiveCatalog(catalog);
  const mutations = [
    {
      name: "catalog named pair side",
      value: {
        ...parsedCatalog,
        pairs: parsedCatalog.pairs.map((pair, index) =>
          index === 0 ? { ...pair, A: { ...pair.A, name: "assurance" } } : pair,
        ),
      },
      runtime: parsePerspectiveCatalog,
      schema: validateCatalog,
    },
    {
      name: "catalog irrelevant pair provenance",
      value: {
        ...parsedCatalog,
        pairs: parsedCatalog.pairs.map((pair, index) =>
          index === 0
            ? {
                ...pair,
                irrelevant: { ...pair.irrelevant, pairId: pair.pairId },
              }
            : pair,
        ),
      },
      runtime: parsePerspectiveCatalog,
      schema: validateCatalog,
    },
    {
      name: "catalog duplicate irrelevant provenance",
      value: {
        ...parsedCatalog,
        pairs: parsedCatalog.pairs.map((pair, index) =>
          index === 1
            ? {
                ...pair,
                irrelevant: {
                  ...pair.irrelevant,
                  pairId: parsedCatalog.pairs[0]!.irrelevant.pairId,
                },
              }
            : pair,
        ),
      },
      runtime: parsePerspectiveCatalog,
      schema: validateCatalog,
    },
    {
      name: "blueprint legacy duplicate evidence array",
      value: {
        ...blueprint,
        drafts: blueprint.drafts.map((draft, index) =>
          index === 0
            ? {
                ...draft,
                evidence: [
                  {
                    ref: "evidence-product-000",
                    content: "first content",
                  },
                  {
                    ref: "evidence-product-000",
                    content: "second content",
                  },
                ],
              }
            : draft,
        ),
      },
      runtime: parseDomainBlueprint,
      schema: validateBlueprint,
    },
    ...["__proto__", "constructor", "prototype"].map((dangerousKey) => ({
      name: `blueprint dangerous evidence key ${dangerousKey}`,
      value: {
        ...blueprint,
        drafts: blueprint.drafts.map((draft, index) =>
          index === 0
            ? {
                ...draft,
                evidence: Object.fromEntries([
                  [dangerousKey, "synthetic public evidence"],
                ]),
              }
            : draft,
        ),
      },
      runtime: parseDomainBlueprint,
      schema: validateBlueprint,
    })),
    {
      name: "blueprint empty evidence content",
      value: {
        ...blueprint,
        drafts: blueprint.drafts.map((draft, index) =>
          index === 0
            ? { ...draft, evidence: { "evidence-product-000": "" } }
            : draft,
        ),
      },
      runtime: parseDomainBlueprint,
      schema: validateBlueprint,
    },
    {
      name: "blueprint missing invariant decision",
      value: {
        ...blueprint,
        drafts: blueprint.drafts.map((draft, index) =>
          index === 0
            ? {
                ...draft,
                decisions: draft.decisions.map((decision) => ({
                  ...decision,
                  partition: "sensitive",
                })),
              }
            : draft,
        ),
      },
      runtime: parseDomainBlueprint,
      schema: validateBlueprint,
    },
  ];
  const mismatches = mutations.flatMap(({ name, value, runtime, schema }) => {
    let runtimeAccepted = true;
    try {
      runtime(value);
    } catch {
      runtimeAccepted = false;
    }
    const schemaAccepted = schema(value);
    return runtimeAccepted || schemaAccepted
      ? [{ name, runtimeAccepted, schemaAccepted }]
      : [];
  });

  assert.deepEqual(mismatches, []);
});

test("materialize-bank CLI reads named sources and exits by campaign state", () => {
  const root = mkdtempSync(join(tmpdir(), "coffee-chat-materialize-cli-"));
  const blueprintsRoot = join(root, "blueprints");
  const destination = join(root, "bank");
  const invalidDestination = join(root, "invalid-bank");
  const catalogFile = join(root, "catalog.json");
  try {
    mkdirSync(blueprintsRoot);
    writeFileSync(
      catalogFile,
      JSON.stringify(perspectiveCatalogSource()),
      "utf8",
    );
    for (const blueprint of campaignBlueprints()) {
      writeFileSync(
        join(blueprintsRoot, `${blueprint.domain}.json`),
        JSON.stringify(blueprint),
        "utf8",
      );
    }
    const run = (target: string) =>
      spawnSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "src/cli.ts",
          "materialize-bank",
          "--catalog",
          catalogFile,
          "--blueprints",
          blueprintsRoot,
          "--destination",
          target,
        ],
        { encoding: "utf8" },
      );

    const valid = run(destination);
    assert.equal(valid.status, 0, valid.stderr || valid.stdout);
    assert.equal(JSON.parse(valid.stdout).state, "valid");
    assert.equal(existsSync(join(destination, "campaign.json")), true);

    const invalidProduct = campaignBlueprints()[0]!;
    invalidProduct.drafts[32] = {
      ...invalidProduct.drafts[32]!,
      checks: passingChecks,
    };
    writeFileSync(
      join(blueprintsRoot, "product.json"),
      JSON.stringify(invalidProduct),
      "utf8",
    );
    const invalid = run(invalidDestination);
    assert.equal(invalid.status, 1, invalid.stderr);
    assert.equal(JSON.parse(invalid.stdout).state, "invalid");
    assert.equal(existsSync(invalidDestination), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

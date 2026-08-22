#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

import { stableDigest } from "../src/contracts.ts";

const root = process.argv[2] ?? "qualification/corpus";
const labelsPath = `${root}/reference-labels.jsonl`;
const manifestPath = `${root}/reference-labels-manifest.json`;
const distributionPath = `${root}/label-distribution.json`;

const labels = (await readFile(labelsPath, "utf8"))
  .split(/\r?\n/u)
  .filter((line) => line.trim() !== "")
  .map((line) => ({
    ...JSON.parse(line),
    authority: "project_owner_reference",
    reviewState: "project_owner_reviewed",
  }));
const distribution = JSON.parse(await readFile(distributionPath, "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

distribution.authority = "project_owner_reference";
distribution.reviewState = "project_owner_reviewed";
distribution.status = "project_owner_reviewed";
manifest.authority = "project_owner_reference";
manifest.reviewState = "project_owner_reviewed";
manifest.referenceLabelsDigest = stableDigest(labels);
manifest.distributionDigest = stableDigest(distribution);
const { manifestDigest: _oldManifestDigest, ...manifestSemantic } = manifest;
manifest.manifestDigest = stableDigest(manifestSemantic);

await writeFile(
  labelsPath,
  `${labels.map((label) => JSON.stringify(label)).join("\n")}\n`,
  "utf8",
);
await writeFile(
  distributionPath,
  `${JSON.stringify(distribution, null, 2)}\n`,
  "utf8",
);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

process.stdout.write(
  `${JSON.stringify({
    labels: labels.length,
    authority: manifest.authority,
    reviewState: manifest.reviewState,
    labelDigest: manifest.referenceLabelsDigest,
  })}\n`,
);

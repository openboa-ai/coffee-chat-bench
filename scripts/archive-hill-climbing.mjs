#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const DEFAULT_RELEASE_TAG = "campaign-luna-provisional-2026.8.22";
const ROOT_METADATA = [
  "campaign.json",
  "campaign-policy.json",
  "index.json",
  "mini-index.json",
  "progress.png",
  "readiness.json",
];

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const options = {
    root: "qualification/hill-climbing",
    output: null,
    releaseTag: DEFAULT_RELEASE_TAG,
    trackedManifest: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--root" && value) {
      options.root = value;
      index += 1;
    } else if (argument === "--output" && value) {
      options.output = value;
      index += 1;
    } else if (argument === "--release-tag" && value) {
      options.releaseTag = value;
      index += 1;
    } else if (argument === "--tracked-manifest" && value) {
      options.trackedManifest = value;
      index += 1;
    } else {
      fail(
        "usage: archive-hill-climbing.mjs --output <directory> [--root <directory>] [--release-tag <tag>] [--tracked-manifest <path>]",
      );
    }
  }
  if (!options.output) fail("--output is required");
  return options;
}

async function walkFiles(root, prefix) {
  const current = join(root, prefix);
  const entries = await readdir(current, { withFileTypes: true });
  const paths = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const child = join(prefix, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await walkFiles(root, child)));
    } else if (entry.isFile()) {
      paths.push(child);
    } else {
      fail(`unsupported evidence entry: ${child}`);
    }
  }
  return paths;
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return `sha256:${hash.digest("hex")}`;
}

function gitValue(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function runArchive({ root, paths, outputPath, listPath }) {
  return new Promise((resolvePromise, reject) => {
    const tar = spawn("tar", ["-C", root, "-cf", "-", "-T", listPath]);
    const zstd = spawn("zstd", ["-T0", "-3", "-q", "-o", outputPath]);
    let tarError = "";
    let zstdError = "";
    tar.stderr.setEncoding("utf8");
    zstd.stderr.setEncoding("utf8");
    tar.stderr.on("data", (chunk) => {
      tarError += chunk;
    });
    zstd.stderr.on("data", (chunk) => {
      zstdError += chunk;
    });
    tar.on("error", reject);
    zstd.on("error", reject);
    tar.stdout.pipe(zstd.stdin);
    let tarStatus;
    let zstdStatus;
    const finish = () => {
      if (tarStatus === undefined || zstdStatus === undefined) return;
      if (tarStatus !== 0 || zstdStatus !== 0) {
        reject(
          new Error(
            `archive failed (tar=${tarStatus}, zstd=${zstdStatus}): ${tarError}${zstdError}`,
          ),
        );
        return;
      }
      resolvePromise({ paths });
    };
    tar.on("close", (status) => {
      tarStatus = status;
      finish();
    });
    zstd.on("close", (status) => {
      zstdStatus = status;
      finish();
    });
  });
}

async function buildArchive({ root, outputDir, scope, paths, releaseTag }) {
  const assetName = `luna-provisional-2026.8.22-${scope}-evidence.tar.zst`;
  const outputPath = join(outputDir, assetName);
  const listPath = join(outputDir, `.${scope}.files.txt`);
  const archiveUri = `https://github.com/openboa-ai/coffee-chat-bench/releases/download/${releaseTag}/${assetName}`;
  const files = [];
  for (const path of paths) {
    const absolutePath = join(root, path);
    const fileStat = await stat(absolutePath);
    files.push({
      path,
      bytes: fileStat.size,
      sha256: await sha256(absolutePath),
    });
  }
  const uncompressedBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  await writeFile(listPath, `${paths.join("\n")}\n`, "utf8");
  try {
    await runArchive({ root, paths, outputPath, listPath });
  } finally {
    await rm(listPath, { force: true });
  }
  const archiveStat = await stat(outputPath);
  return {
    scope,
    assetName,
    archiveUri,
    sha256: await sha256(outputPath),
    bytes: archiveStat.size,
    uncompressedBytes,
    entryCount: files.length,
    files,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = resolve(options.root);
  const outputDir = resolve(options.output);
  if (!isAbsolute(options.root) && !root) fail("invalid root");
  await mkdir(outputDir, { recursive: true });
  const existing = await readdir(outputDir);
  if (existing.length > 0)
    fail(`refusing to overwrite non-empty archive directory: ${outputDir}`);

  const available = new Set(await walkFiles(root, ""));
  for (const path of ROOT_METADATA) {
    if (!available.has(path)) fail(`missing campaign metadata: ${path}`);
  }
  const fullPaths = [
    ...ROOT_METADATA,
    ...(await walkFiles(root, "steps")).map((path) => path),
  ].sort();
  const miniPaths = [
    ...ROOT_METADATA,
    ...(await walkFiles(root, "mini")).map((path) => path),
  ].sort();

  const [full, mini] = await Promise.all([
    buildArchive({
      root,
      outputDir,
      scope: "full",
      paths: fullPaths,
      releaseTag: options.releaseTag,
    }),
    buildArchive({
      root,
      outputDir,
      scope: "mini",
      paths: miniPaths,
      releaseTag: options.releaseTag,
    }),
  ]);
  const manifest = {
    artifact_type: "hill_climbing_evidence_manifest",
    campaignId: JSON.parse(await readFile(join(root, "campaign.json"), "utf8"))
      .campaignId,
    evidenceState: "provisional",
    generatedAt: new Date().toISOString(),
    sourceRoot: relative(process.cwd(), root) || ".",
    sourceCommit: gitValue(["rev-parse", "HEAD"]),
    sourceTreeState: "working_tree_snapshot",
    releaseTag: options.releaseTag,
    storage: "github_release_asset",
    publication: {
      status: "prepared",
      published: false,
      releaseTag: options.releaseTag,
    },
    writeOnce: true,
    archives: [full, mini],
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(
    join(outputDir, "evidence-manifest.json"),
    manifestText,
    "utf8",
  );
  if (options.trackedManifest) {
    const trackedPath = resolve(options.trackedManifest);
    await mkdir(dirname(trackedPath), { recursive: true });
    await writeFile(trackedPath, manifestText, "utf8");
  }
  console.log(
    JSON.stringify(
      {
        manifestPath: join(outputDir, "evidence-manifest.json"),
        archives: manifest.archives.map(
          ({
            scope,
            assetName,
            bytes,
            uncompressedBytes,
            entryCount,
            sha256,
          }) => ({
            scope,
            assetName,
            bytes,
            uncompressedBytes,
            entryCount,
            sha256,
          }),
        ),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import type { Dirent, Stats } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  CONDITION_LABELS,
  parseCaseBundle,
  type CaseBundle,
  type Digest,
} from "./contracts.ts";
import { stableDigest } from "./identity.ts";

const MAX_BANK_FILE_BYTES = 256 * 1024;
const MAX_BANK_AGGREGATE_BYTES = 4 * 1024 * 1024;
const MAX_BANK_DEPTH = 8;
const MAX_BANK_ENTRIES = 512;
const utf8 = new TextDecoder("utf-8", { fatal: true });

export interface BankFileReport {
  readonly file: string;
  readonly state: "valid" | "invalid";
  readonly errors: readonly string[];
}

export interface BankValidationReport {
  readonly state: "valid" | "invalid";
  readonly digest: Digest;
  readonly files: readonly BankFileReport[];
}

interface DiscoveredFile {
  readonly file: string;
  readonly source: string | undefined;
  readonly caseBundle: CaseBundle | undefined;
  readonly errors: string[];
}

export interface BankFileSystem {
  readonly lstat: (path: string) => Stats;
  readonly readDirectory: (path: string) => Dirent[];
  readonly readFile: (path: string) => string;
  readonly realpath: (path: string) => string;
}

const nodeFileSystem: BankFileSystem = {
  lstat: lstatSync,
  readDirectory: (path) => readdirSync(path, { withFileTypes: true }),
  readFile: (path) => utf8.decode(readFileSync(path)),
  realpath: realpathSync,
};

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function relativeFile(root: string, path: string): string {
  const file = relative(root, path);
  if (
    file === "" ||
    file === ".." ||
    file.startsWith(`..${sep}`) ||
    isAbsolute(file)
  ) {
    throw new Error("path escapes bank root");
  }
  return file.split(sep).join("/");
}

function isWithinRoot(root: string, path: string): boolean {
  const file = relative(root, path);
  return file !== ".." && !file.startsWith(`..${sep}`) && !isAbsolute(file);
}

function invalidFile(file: string, error: unknown): DiscoveredFile {
  return {
    file,
    source: undefined,
    caseBundle: undefined,
    errors: [asErrorMessage(error)],
  };
}

function readCaseFiles(
  root: string,
  fileSystem: BankFileSystem,
): DiscoveredFile[] {
  const discovered: DiscoveredFile[] = [];
  let entriesSeen = 0;
  let aggregateBytes = 0;

  function visit(directory: string, depth: number): void {
    if (depth > MAX_BANK_DEPTH) {
      throw new Error(`bank depth exceeds ${MAX_BANK_DEPTH} entry limit`);
    }
    let entries: Dirent[];
    try {
      entries = fileSystem
        .readDirectory(directory)
        .sort((left, right) => comparePaths(left.name, right.name));
    } catch (error) {
      discovered.push(
        invalidFile(
          directory === root ? "." : relativeFile(root, directory),
          error,
        ),
      );
      return;
    }
    for (const entry of entries) {
      entriesSeen += 1;
      if (entriesSeen > MAX_BANK_ENTRIES) {
        throw new Error(`bank exceeds ${MAX_BANK_ENTRIES} entry limit`);
      }
      const path = resolve(directory, entry.name);
      const file = relativeFile(root, path);
      let stat: Stats;
      try {
        stat = fileSystem.lstat(path);
      } catch (error) {
        discovered.push(invalidFile(file, error));
        continue;
      }
      if (stat.isSymbolicLink()) {
        discovered.push({
          file,
          source: undefined,
          caseBundle: undefined,
          errors: ["symbolic links are not permitted in a bank"],
        });
        continue;
      }

      let resolvedPath: string;
      try {
        resolvedPath = fileSystem.realpath(path);
      } catch (error) {
        discovered.push(invalidFile(file, error));
        continue;
      }
      if (!isWithinRoot(root, resolvedPath)) {
        discovered.push({
          file,
          source: undefined,
          caseBundle: undefined,
          errors: ["path escapes bank root"],
        });
        continue;
      }
      if (stat.isDirectory()) {
        visit(resolvedPath, depth + 1);
        continue;
      }
      if (!stat.isFile()) {
        discovered.push({
          file,
          source: undefined,
          caseBundle: undefined,
          errors: ["unsupported filesystem entry in bank"],
        });
        continue;
      }
      if (!file.endsWith(".json")) continue;
      if (stat.size > MAX_BANK_FILE_BYTES) {
        discovered.push(
          invalidFile(
            file,
            `bank file exceeds ${MAX_BANK_FILE_BYTES} byte limit`,
          ),
        );
        continue;
      }
      aggregateBytes += stat.size;
      if (aggregateBytes > MAX_BANK_AGGREGATE_BYTES) {
        throw new Error(
          `bank aggregate exceeds ${MAX_BANK_AGGREGATE_BYTES} byte limit`,
        );
      }

      let source: string | undefined;
      let caseBundle: CaseBundle | undefined;
      const errors: string[] = [];
      try {
        source = fileSystem.readFile(resolvedPath);
        caseBundle = parseCaseBundle(JSON.parse(source));
      } catch (error) {
        errors.push(asErrorMessage(error));
      }
      discovered.push({ file, source, caseBundle, errors });
    }
  }

  visit(root, 0);
  return discovered.sort((left, right) => comparePaths(left.file, right.file));
}

function appendDuplicateErrors(files: DiscoveredFile[]): void {
  const caseIds = new Map<string, string>();
  const familyConditions = new Map<string, string>();
  for (const file of files) {
    if (file.caseBundle === undefined || file.errors.length > 0) continue;
    const priorCaseFile = caseIds.get(file.caseBundle.caseId);
    if (priorCaseFile === undefined) {
      caseIds.set(file.caseBundle.caseId, file.file);
    } else {
      file.errors.push(
        `duplicate caseId "${file.caseBundle.caseId}"; first defined by ${priorCaseFile}`,
      );
    }

    for (const condition of CONDITION_LABELS) {
      const tuple = `${file.caseBundle.familyId}:${condition}`;
      const priorFamilyFile = familyConditions.get(tuple);
      if (priorFamilyFile === undefined) {
        familyConditions.set(tuple, file.file);
      } else {
        file.errors.push(
          `duplicate family-condition tuple "${tuple}"; first defined by ${priorFamilyFile}`,
        );
      }
    }
  }
}

function reportForRootError(message: string): BankValidationReport {
  const files: readonly BankFileReport[] = [
    { file: ".", state: "invalid", errors: [message] },
  ];
  return { state: "invalid", digest: stableDigest({ files }), files };
}

export function validateBank(
  root: string,
  fileSystem: BankFileSystem = nodeFileSystem,
): BankValidationReport {
  const absoluteRoot = resolve(root);
  try {
    const rootStat = fileSystem.lstat(absoluteRoot);
    if (rootStat.isSymbolicLink()) {
      return reportForRootError("bank root must not be a symbolic link");
    }
    if (!rootStat.isDirectory()) {
      return reportForRootError("bank root must be a directory");
    }
    const resolvedRoot = fileSystem.realpath(absoluteRoot);
    const files = readCaseFiles(resolvedRoot, fileSystem);
    appendDuplicateErrors(files);
    const reportFiles = files.map(({ file, errors }) => ({
      file,
      state: errors.length === 0 ? ("valid" as const) : ("invalid" as const),
      errors,
    }));
    const digest = stableDigest(
      files.map(({ file, source, caseBundle }) => ({
        file,
        content: caseBundle ?? source ?? null,
      })),
    );
    return {
      state: reportFiles.every((file) => file.state === "valid")
        ? "valid"
        : "invalid",
      digest,
      files: reportFiles,
    };
  } catch (error) {
    return reportForRootError(asErrorMessage(error));
  }
}

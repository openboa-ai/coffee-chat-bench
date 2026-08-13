import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import type { Dirent } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { type BankFileSystem, validateBank } from "../src/bank.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const fixturesRoot = join(import.meta.dirname, "fixtures", "bank");

function fixtureRoot(): string {
  return mkdtempSync(join(tmpdir(), "coffee-chat-bank-"));
}

function copyFixture(
  root: string,
  fixture: string,
  destination = fixture,
): void {
  const target = join(root, destination);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(fixturesRoot, fixture), target);
}

function withBank(assertion: (root: string) => void): void {
  const root = fixtureRoot();
  try {
    assertion(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function runValidate(root: string) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", "src/cli.ts", "validate", root],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
}

test("validates recursively discovered case files in deterministic order", () => {
  withBank((root) => {
    copyFixture(root, "valid/nested/bravo.json");
    copyFixture(root, "valid/alpha.json");

    const report = validateBank(root);

    assert.equal(report.state, "valid");
    assert.deepEqual(report.files, [
      { file: "valid/alpha.json", state: "valid", errors: [] },
      { file: "valid/nested/bravo.json", state: "valid", errors: [] },
    ]);
    assert.match(report.digest, /^sha256:[0-9a-f]{64}$/u);
  });
});

test("rejects an oversized otherwise-valid case file before parsing", () => {
  withBank((root) => {
    const destination = join(root, "oversized.json");
    writeFileSync(
      destination,
      `${" ".repeat(1024 * 1024)}${readFileSync(join(fixturesRoot, "valid/alpha.json"), "utf8")}`,
      "utf8",
    );

    const report = validateBank(root);

    assert.equal(report.state, "invalid");
    assert.match(report.files[0]?.errors[0] ?? "", /exceeds.*byte limit/i);
  });
});

test("rejects an otherwise-valid case file beyond the bank depth budget", () => {
  withBank((root) => {
    copyFixture(root, "valid/alpha.json", "a/b/c/d/e/f/g/h/i/alpha.json");

    const report = validateBank(root);

    assert.equal(report.state, "invalid");
    assert.match(report.files[0]?.errors[0] ?? "", /depth.*limit/i);
  });
});

test("stops lazy directory enumeration at the global bank entry budget", () => {
  withBank((root) => {
    let entriesYielded = 0;
    const fileSystem: BankFileSystem = {
      lstat: lstatSync,
      readDirectory() {
        return (function* (): Iterable<Dirent> {
          for (let index = 0; index < 513; index += 1) {
            entriesYielded += 1;
            yield {
              name: `${String(index).padStart(3, "0")}.json`,
              isBlockDevice: () => false,
              isCharacterDevice: () => false,
              isDirectory: () => false,
              isFIFO: () => false,
              isFile: () => true,
              isSocket: () => false,
              isSymbolicLink: () => false,
              parentPath: root,
              path: root,
            } as Dirent;
          }
          throw new Error("enumeration continued beyond the entry budget");
        })();
      },
      readFile: () => {
        throw new Error("entry metadata must not be read after budget failure");
      },
      realpath: realpathSync,
    };

    const report = validateBank(root, fileSystem);

    assert.equal(entriesYielded, 513);
    assert.match(report.files[0]?.errors[0] ?? "", /exceeds 512 entry limit/i);
  });
});

test("rejects content that grows beyond the file budget after metadata", () => {
  withBank((root) => {
    copyFixture(root, "valid/alpha.json", "alpha.json");
    const valid = readFileSync(join(root, "alpha.json"), "utf8");
    const fileSystem: BankFileSystem = {
      lstat: lstatSync,
      readDirectory: (path) => readdirSync(path, { withFileTypes: true }),
      readFile: () => `${" ".repeat(300 * 1024)}${valid}`,
      realpath: realpathSync,
    };

    const report = validateBank(root, fileSystem);

    assert.equal(report.state, "invalid");
    assert.match(report.files[0]?.errors[0] ?? "", /exceeds.*byte limit/i);
  });
});

test("keeps the bank digest stable when filesystem creation order differs", () => {
  const first = fixtureRoot();
  const second = fixtureRoot();
  try {
    copyFixture(first, "valid/nested/bravo.json");
    copyFixture(first, "valid/alpha.json");
    copyFixture(second, "valid/alpha.json");
    copyFixture(second, "valid/nested/bravo.json");

    assert.equal(validateBank(first).digest, validateBank(second).digest);
  } finally {
    rmSync(first, { force: true, recursive: true });
    rmSync(second, { force: true, recursive: true });
  }
});

test("rejects evidence content digest tampering at bank admission", () => {
  withBank((root) => {
    copyFixture(root, "valid/alpha.json", "alpha.json");
    const path = join(root, "alpha.json");
    const source = JSON.parse(readFileSync(path, "utf8")) as {
      evidence: Array<{ digest: string }>;
    };
    source.evidence[0]!.digest = `sha256:${"f".repeat(64)}`;
    writeFileSync(path, `${JSON.stringify(source, null, 2)}\n`, "utf8");

    const report = validateBank(root);

    assert.equal(report.state, "invalid");
    assert.match(
      report.files[0]?.errors[0] ?? "",
      /evidence.*digest.*content/i,
    );
  });
});

test("rejects perspective content digest tampering at bank admission", () => {
  withBank((root) => {
    copyFixture(root, "valid/alpha.json", "alpha.json");
    const path = join(root, "alpha.json");
    const source = JSON.parse(readFileSync(path, "utf8")) as {
      perspectives: { A: { digest: string } };
    };
    source.perspectives.A.digest = `sha256:${"f".repeat(64)}`;
    writeFileSync(path, `${JSON.stringify(source, null, 2)}\n`, "utf8");

    const report = validateBank(root);

    assert.equal(report.state, "invalid");
    assert.match(
      report.files[0]?.errors[0] ?? "",
      /perspectives\.A.*digest.*content/i,
    );
  });
});

test("rejects source digest tampering at bank admission", () => {
  withBank((root) => {
    copyFixture(root, "valid/alpha.json", "alpha.json");
    const path = join(root, "alpha.json");
    const source = JSON.parse(readFileSync(path, "utf8")) as {
      sourceDigest: string;
    };
    source.sourceDigest = `sha256:${"f".repeat(64)}`;
    writeFileSync(path, `${JSON.stringify(source, null, 2)}\n`, "utf8");

    const report = validateBank(root);

    assert.equal(report.state, "invalid");
    assert.match(report.files[0]?.errors[0] ?? "", /sourceDigest.*semantic/i);
  });
});

test("reports a parse failure against its source file", () => {
  withBank((root) => {
    copyFixture(root, "malformed.json");

    const report = validateBank(root);

    assert.equal(report.state, "invalid");
    assert.match(report.digest, /^sha256:[0-9a-f]{64}$/u);
    assert.deepEqual(report.files, [
      {
        file: "malformed.json",
        state: "invalid",
        errors: ["sourceDigest must be a sha256 digest"],
      },
    ]);
  });
});

test("rejects a repeated case identity at the duplicate file", () => {
  withBank((root) => {
    copyFixture(root, "valid/alpha.json", "alpha.json");
    copyFixture(root, "duplicate-case-id.json");

    const report = validateBank(root);

    assert.equal(report.state, "invalid");
    assert.deepEqual(report.files.at(1), {
      file: "duplicate-case-id.json",
      state: "invalid",
      errors: ['duplicate caseId "case-alpha"; first defined by alpha.json'],
    });
  });
});

test("rejects every duplicate family-condition tuple at the duplicate file", () => {
  withBank((root) => {
    copyFixture(root, "valid/alpha.json", "alpha.json");
    copyFixture(root, "duplicate-family.json");

    const report = validateBank(root);

    assert.equal(report.state, "invalid");
    assert.deepEqual(report.files.at(1), {
      file: "duplicate-family.json",
      state: "invalid",
      errors: [
        'duplicate family-condition tuple "family-alpha:T0"; first defined by alpha.json',
        'duplicate family-condition tuple "family-alpha:T1-A"; first defined by alpha.json',
        'duplicate family-condition tuple "family-alpha:T1-B"; first defined by alpha.json',
      ],
    });
  });
});

test("rejects symlinked entries instead of resolving an ambiguous bank path", () => {
  withBank((root) => {
    symlinkSync(
      join(fixturesRoot, "valid", "alpha.json"),
      join(root, "linked.json"),
    );

    const report = validateBank(root);

    assert.deepEqual(report.files, [
      {
        file: "linked.json",
        state: "invalid",
        errors: ["symbolic links are not permitted in a bank"],
      },
    ]);
  });
});

test("preserves parsed file errors when a later directory traversal fails", () => {
  withBank((root) => {
    copyFixture(root, "malformed.json");
    copyFixture(root, "valid/alpha.json", "z-blocked/alpha.json");
    const fileSystem: BankFileSystem = {
      lstat: lstatSync,
      readDirectory(path) {
        if (String(path).endsWith("/z-blocked")) {
          throw new Error("fixture traversal denied");
        }
        return readdirSync(path, { withFileTypes: true });
      },
      readFile: (path) => readFileSync(path, "utf8"),
      realpath: realpathSync,
    };

    const report = validateBank(root, fileSystem);

    assert.equal(report.state, "invalid");
    assert.deepEqual(report.files, [
      {
        file: "malformed.json",
        state: "invalid",
        errors: ["sourceDigest must be a sha256 digest"],
      },
      {
        file: "z-blocked",
        state: "invalid",
        errors: ["fixture traversal denied"],
      },
    ]);
  });
});

test("validate CLI emits repeatable JSON and fails invalid banks", () => {
  withBank((root) => {
    copyFixture(root, "valid/alpha.json", "alpha.json");
    const first = runValidate(root);
    const second = runValidate(root);

    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, second.stdout);
    assert.deepEqual(JSON.parse(first.stdout), validateBank(root));

    copyFixture(root, "malformed.json");
    const invalid = runValidate(root);

    assert.equal(invalid.status, 1);
    assert.equal(JSON.parse(invalid.stdout).state, "invalid");
    assert.deepEqual(JSON.parse(invalid.stdout).files.at(1), {
      file: "malformed.json",
      state: "invalid",
      errors: ["sourceDigest must be a sha256 digest"],
    });
  });
});

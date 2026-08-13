import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");

function withFifo(run: (fifo: string, root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "coffee-chat-fifo-"));
  const fifo = join(root, "artifact.json");
  try {
    execFileSync("mkfifo", [fifo]);
    run(fifo, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the shared TypeScript reader rejects a FIFO without waiting", () => {
  withFifo((fifo) => {
    const moduleUrl = pathToFileURL(
      join(repositoryRoot, "src/bounded-fs.ts"),
    ).href;
    const source = `import { readUtf8File } from ${JSON.stringify(moduleUrl)}; readUtf8File(process.argv[1], "FIFO artifact", 1024);`;
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--input-type=module",
        "--eval",
        source,
        fifo,
      ],
      { encoding: "utf8", timeout: 3_000 },
    );

    assert.equal(result.error, undefined, String(result.error));
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /regular file/u);
  });
});

test("the Harbor verifier rejects a FIFO without waiting", () => {
  withFifo((fifo, root) => {
    const artifact = join(root, "unused-artifact.json");
    writeFileSync(artifact, "{}\n", "utf8");
    const result = spawnSync(
      "python3",
      [
        join(repositoryRoot, "harbor/verifier.py"),
        "--judgment",
        fifo,
        "--artifact",
        artifact,
      ],
      { encoding: "utf8", timeout: 3_000 },
    );

    assert.equal(result.error, undefined, String(result.error));
    assert.equal(result.status, 1);
    const response = JSON.parse(result.stdout) as {
      readonly state: string;
      readonly reasons: readonly string[];
    };
    assert.equal(response.state, "verifier_failure");
    assert.match(response.reasons.join(" "), /regular file/u);
  });
});

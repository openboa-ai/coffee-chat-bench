import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";

import { stableDigest } from "../src/digest.ts";

const repositoryRoot = resolve(import.meta.dirname, "..");
const fixturesRoot = join(import.meta.dirname, "fixtures", "projection");

interface ProjectedCliOutput {
  readonly sourceDigest: string;
  readonly candidateDigest: string;
  readonly verifierDigest: string;
  readonly projectionDigest: string;
}

function temporaryDirectory(): string {
  return mkdtempSync(join(tmpdir(), "coffee-chat-projection-"));
}

function withTemporaryDirectory(assertion: (root: string) => void): void {
  const root = temporaryDirectory();
  try {
    assertion(root);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function runCli(args: readonly string[]) {
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", "src/cli.ts", ...args],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
}

function project(destination: string, condition = "a") {
  const result = runCli([
    "project",
    join(fixturesRoot, "case.json"),
    condition,
    destination,
  ]);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as ProjectedCliOutput;
}

function copyArtifact(root: string, name: string): string {
  const artifact = join(root, `${name}.json`);
  cpSync(join(fixturesRoot, "artifacts", `${name}.json`), artifact);
  return artifact;
}

function copyProjectedOracle(root: string, projectionRoot: string): string {
  const artifact = join(root, "oracle.json");
  cpSync(join(projectionRoot, "verifier", "oracle.json"), artifact);
  return artifact;
}

function runHarborVerifier(projectionRoot: string, artifact: string) {
  const tests = join(projectionRoot, "harbor", "tests");
  const logs = join(projectionRoot, "verifier-logs");
  return spawnSync("sh", [join(tests, "test.sh")], {
    encoding: "utf8",
    env: {
      ...process.env,
      HARBOR_ARTIFACT: artifact,
      HARBOR_TEST_ROOT: tests,
      HARBOR_VERIFIER_LOGS: logs,
    },
  });
}

function auditVerifierReads(
  projectionRoot: string,
  judgment: string,
  artifact: string,
) {
  const verifier = join(projectionRoot, "harbor", "tests", "verifier.py");
  const program = `import importlib.util, json, sys
source, judgment, artifact = sys.argv[1:]
spec = importlib.util.spec_from_file_location("projected_verifier", source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
events = []
def audit(event, args):
    if event in {"open", "os.listdir", "os.scandir"}:
        events.append([event, str(args[0]) if args else ""])
sys.addaudithook(audit)
status = module.verify(judgment, artifact)
print(json.dumps({"events": events, "status": status}, sort_keys=True))
`;
  return spawnSync("python3", ["-c", program, verifier, judgment, artifact], {
    encoding: "utf8",
  });
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function artifactDigest(value: Record<string, unknown>): string {
  const manifest = {
    ...(value.manifest as Record<string, unknown>),
  };
  delete manifest.artifactDigest;
  const digestValue = { ...value, manifest };
  return `sha256:${createHash("sha256").update(canonicalJson(digestValue)).digest("hex")}`;
}

function writeValidArtifact(
  root: string,
  name: string,
  mutate: (value: Record<string, unknown>) => void,
): string {
  const value = JSON.parse(
    readFileSync(join(fixturesRoot, "artifacts", "oracle.json"), "utf8"),
  ) as Record<string, unknown>;
  mutate(value);
  const manifest = value.manifest as Record<string, unknown>;
  manifest.artifactDigest = artifactDigest(value);
  const path = join(root, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path;
}

function writeProjectedArtifact(
  root: string,
  projectionRoot: string,
  name: string,
  mutate: (value: Record<string, unknown>) => void,
): string {
  const value = JSON.parse(
    readFileSync(join(projectionRoot, "verifier", "oracle.json"), "utf8"),
  ) as Record<string, unknown>;
  mutate(value);
  const manifest = value.manifest as Record<string, unknown>;
  manifest.artifactDigest = artifactDigest(value);
  const path = join(root, `${name}.json`);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path;
}

function fileTree(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files[relative(root, path)] = readFileSync(path, "utf8");
    }
  }
  visit(root);
  return files;
}

function collectKeysAndStrings(value: unknown): {
  readonly keys: readonly string[];
  readonly strings: readonly string[];
} {
  const keys: string[] = [];
  const strings: string[] = [];
  function visit(entry: unknown): void {
    if (typeof entry === "string") {
      strings.push(entry);
      return;
    }
    if (Array.isArray(entry)) {
      for (const item of entry) visit(item);
      return;
    }
    if (entry !== null && typeof entry === "object") {
      for (const [key, item] of Object.entries(entry)) {
        keys.push(key);
        visit(item);
      }
    }
  }
  visit(value);
  return { keys, strings };
}

test("candidate projection contains a solvable public case and no hidden oracle", () => {
  withTemporaryDirectory((root) => {
    const projection = project(join(root, "projection"));
    const candidate = fileTree(join(root, "projection", "candidate"));
    const task = JSON.parse(candidate["task.json"] ?? "") as Record<
      string,
      unknown
    >;
    const evidence = JSON.parse(candidate["evidence.json"] ?? "") as {
      readonly evidence: ReadonlyArray<Record<string, unknown>>;
    };
    const perspective = JSON.parse(
      candidate["perspective.json"] ?? "",
    ) as Record<string, unknown>;
    const outputContract = JSON.parse(
      candidate["output-contract.json"] ?? "",
    ) as Record<string, unknown>;

    assert.deepEqual(task.task, {
      instruction:
        "Choose one region for each decision using the evidence and any supplied perspective.",
      deliverable:
        "Write /app/output.json with the declared decision manifest and a concise evidence-grounded response.",
    });
    assert.match(String(task.trialId), /^trial-[0-9a-f]{64}$/u);
    assert.equal(task.condition, "T1-A");
    assert.deepEqual(task.decisions, [
      {
        decisionId: "focus",
        prompt: "How should the work block be handled?",
        regionOptions: ["neutral", "preserve-focus", "attend-meeting"],
      },
      {
        decisionId: "sources",
        prompt: "How should the supporting material be handled?",
        regionOptions: ["cite-sources", "omit-sources"],
      },
    ]);
    assert.equal(
      evidence.evidence.every(
        (item) =>
          typeof item.content === "string" &&
          typeof item.digest === "string" &&
          typeof item.ref === "string",
      ),
      true,
    );
    assert.deepEqual(perspective, {
      id: "perspective-focus-a",
      pairId: "perspective-pair-focus",
      content:
        "Protect uninterrupted work blocks and move optional meetings when deadlines are near.",
      digest: perspective.digest,
    });
    assert.deepEqual(outputContract, {
      outputPath: "/app/output.json",
      artifactSchema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: ["manifest", "response", "accessedPaths"],
        properties: {
          manifest: {
            type: "object",
            additionalProperties: false,
            required: [
              "release",
              "trialId",
              "caseId",
              "condition",
              "artifactDigest",
              "decisions",
            ],
            properties: {
              release: { const: "2026.8.12" },
              trialId: {
                const:
                  "trial-9e05c89e6a757d7922506044444137300f0f8ac1f417bdce8d5e424fc86a4e58",
              },
              caseId: { const: "case-projection" },
              condition: { const: "T1-A" },
              artifactDigest: {
                type: "string",
                pattern: "^sha256:[0-9a-f]{64}$",
              },
              decisions: {
                type: "array",
                minItems: 2,
                maxItems: 2,
                prefixItems: [
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["decisionId", "selectedRegion", "evidenceRefs"],
                    properties: {
                      decisionId: { const: "focus" },
                      selectedRegion: {
                        enum: ["neutral", "preserve-focus", "attend-meeting"],
                      },
                      evidenceRefs: {
                        type: "array",
                        uniqueItems: true,
                        items: { enum: ["calendar", "notes"] },
                      },
                    },
                  },
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["decisionId", "selectedRegion", "evidenceRefs"],
                    properties: {
                      decisionId: { const: "sources" },
                      selectedRegion: {
                        enum: ["cite-sources", "omit-sources"],
                      },
                      evidenceRefs: {
                        type: "array",
                        uniqueItems: true,
                        items: { enum: ["calendar", "notes"] },
                      },
                    },
                  },
                ],
                items: false,
              },
            },
          },
          response: { type: "string" },
          accessedPaths: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
      artifactDigest: {
        algorithm: "sha256",
        prefix: "sha256:",
        input: {
          source: "artifact",
          omitMemberPath: ["manifest", "artifactDigest"],
        },
        canonicalJson: {
          sortObjectKeys: true,
          preserveArrayOrder: true,
          itemSeparator: ",",
          keyValueSeparator: ":",
          ensureAscii: false,
          allowNaN: false,
          encoding: "utf-8",
        },
      },
    });

    const candidateFilesForDigest = Object.entries(candidate)
      .map(([file, content]) => ({ file, content }))
      .sort((left, right) => left.file.localeCompare(right.file));
    assert.equal(
      projection.candidateDigest,
      stableDigest(candidateFilesForDigest),
    );
    const digestWithoutOutputContract = stableDigest(
      candidateFilesForDigest
        .filter(({ file }) => file !== "output-contract.json")
        .map(({ file, content }) => ({ file, content })),
    );
    assert.notEqual(projection.candidateDigest, digestWithoutOutputContract);

    const candidateValues = Object.values(candidate).map((content) =>
      JSON.parse(content),
    );
    const visible = collectKeysAndStrings(candidateValues);
    assert.equal(visible.keys.includes("partition"), false);
    assert.equal(visible.keys.includes("acceptedRegions"), false);
    assert.equal(visible.strings.includes("sensitive"), false);
    assert.equal(visible.strings.includes("invariant"), false);

    const judgment = JSON.parse(
      readFileSync(
        join(root, "projection", "verifier", "judgment.json"),
        "utf8",
      ),
    ) as {
      readonly trialId: string;
      readonly decisions: ReadonlyArray<Record<string, unknown>>;
    };
    assert.equal(judgment.trialId, task.trialId);
    assert.deepEqual(judgment.decisions[0], {
      decisionId: "focus",
      prompt: "How should the work block be handled?",
      regionOptions: ["neutral", "preserve-focus", "attend-meeting"],
      partition: "sensitive",
      acceptedRegions: ["preserve-focus"],
      requiredEvidenceRefs: ["calendar"],
    });
  });
});

test("candidate trees omit hidden partition labels and accepted mappings in every condition", () => {
  withTemporaryDirectory((root) => {
    for (const condition of ["a", "b", "none", "irrelevant"] as const) {
      const destination = join(root, condition);
      project(destination, condition);
      const candidate = fileTree(join(destination, "candidate"));
      assert.ok(candidate["output-contract.json"], condition);
      const values = Object.values(candidate).map((content) =>
        JSON.parse(content),
      );
      const visible = collectKeysAndStrings(values);
      assert.equal(visible.keys.includes("partition"), false, condition);
      assert.equal(visible.keys.includes("acceptedRegions"), false, condition);
      assert.equal(visible.strings.includes("sensitive"), false, condition);
      assert.equal(visible.strings.includes("invariant"), false, condition);
    }
  });
});

test("project emits a Harbor task whose resolved agent environment contains only candidate input", () => {
  withTemporaryDirectory((root) => {
    const projection = project(join(root, "a"));
    const candidate = fileTree(join(root, "a", "candidate"));
    const verifier = fileTree(join(root, "a", "verifier"));
    const harbor = join(root, "a", "harbor");

    assert.deepEqual(Object.keys(candidate), [
      "evidence.json",
      "output-contract.json",
      "perspective.json",
      "task.json",
    ]);
    assert.deepEqual(JSON.parse(candidate["perspective.json"] ?? ""), {
      id: "perspective-focus-a",
      pairId: "perspective-pair-focus",
      content:
        "Protect uninterrupted work blocks and move optional meetings when deadlines are near.",
      digest:
        "sha256:73d14b437fd9955f51f40775764357fba137d7b13c3121a2fc14a9930af077d5",
    });
    const candidateBytes = Object.values(candidate).join("");
    assert.equal(candidateBytes.includes("verifier"), false);
    assert.equal(candidateBytes.includes("judgment"), false);
    assert.equal(candidateBytes.includes("oracle"), false);
    assert.deepEqual(Object.keys(verifier).sort(), [
      "judgment.json",
      "oracle.json",
    ]);
    const runtime = fileTree(join(harbor, "environment", "input"));
    assert.deepEqual(runtime, candidate);
    const dockerfile = readFileSync(
      join(harbor, "environment", "Dockerfile"),
      "utf8",
    );
    assert.deepEqual(
      dockerfile.split("\n").filter((line) => line.startsWith("COPY ")),
      ["COPY input/ /app/"],
    );
    assert.match(
      dockerfile,
      /^FROM node@sha256:048ed02c5fd52e86fda6fbd2f6a76cf0d4492fd6c6fee9e2c463ed5108da0e34$/mu,
    );
    assert.doesNotMatch(dockerfile, /^\+ /mu);
    assert.match(
      dockerfile,
      /snapshot\.debian\.org\/archive\/debian\/20260801T000000Z/u,
    );
    assert.match(
      dockerfile,
      /ca-certificates=20230311\+deb12u1 curl=7\.88\.1-10\+deb12u15 ripgrep=13\.0\.0-4\+b2/u,
    );
    assert.equal(
      readFileSync(join(harbor, "instruction.md"), "utf8"),
      "Choose one region for each decision using the evidence and any supplied perspective.\n\nWrite /app/output.json with the declared decision manifest and a concise evidence-grounded response.\n\nFollow /app/output-contract.json exactly.\n",
    );
    const config = spawnSync(
      "python3",
      [
        "-c",
        "import json, sys, tomllib; print(json.dumps(tomllib.load(open(sys.argv[1], 'rb')), sort_keys=True))",
        join(harbor, "task.toml"),
      ],
      { encoding: "utf8" },
    );
    assert.equal(config.status, 0, config.stderr);
    assert.deepEqual(JSON.parse(config.stdout), {
      agent: { network_mode: "no-network" },
      artifacts: ["/app/output.json"],
      environment: { network_mode: "no-network", os: "linux" },
      schema_version: "1.4",
      task: {
        description: "Synthetic PCDA candidate task.",
        name: "openboa-ai/pcda-case-projection",
        version: "2026.8.12",
      },
      verifier: {
        environment_mode: "separate",
        environment: { network_mode: "no-network", os: "linux" },
      },
    });
    assert.match(
      readFileSync(join(harbor, "tests", "Dockerfile"), "utf8"),
      /COPY verifier\.py \/tests\/verifier\.py/u,
    );
    assert.match(projection.sourceDigest, /^sha256:[0-9a-f]{64}$/u);
    assert.match(projection.candidateDigest, /^sha256:[0-9a-f]{64}$/u);
    assert.match(projection.verifierDigest, /^sha256:[0-9a-f]{64}$/u);
  });
});

test("project emits the standalone Harbor verifier build context", () => {
  withTemporaryDirectory((root) => {
    project(join(root, "projection"));
    const tests = fileTree(join(root, "projection", "harbor", "tests"));

    assert.deepEqual(Object.keys(tests), [
      "Dockerfile",
      "judgment.json",
      "test.sh",
      "verifier.py",
    ]);
    assert.deepEqual(
      tests["Dockerfile"]
        ?.split("\n")
        .filter((line) => line.startsWith("COPY ")),
      [
        "COPY verifier.py /tests/verifier.py",
        "COPY judgment.json /tests/judgment.json",
        "COPY test.sh /tests/test.sh",
      ],
    );
  });
});

test("project omits perspective for none and uses only the irrelevant control", () => {
  withTemporaryDirectory((root) => {
    project(join(root, "none"), "none");
    project(join(root, "b"), "b");
    project(join(root, "irrelevant"), "irrelevant");

    assert.equal(
      existsSync(join(root, "none", "candidate", "perspective.json")),
      false,
    );
    assert.deepEqual(Object.keys(fileTree(join(root, "none", "candidate"))), [
      "evidence.json",
      "output-contract.json",
      "task.json",
    ]);
    assert.deepEqual(
      JSON.parse(
        readFileSync(join(root, "b", "candidate", "perspective.json"), "utf8"),
      ),
      {
        id: "perspective-focus-b",
        pairId: "perspective-pair-focus",
        content:
          "Use optional meetings to align early when coordination risk is high.",
        digest:
          "sha256:0d1cbf770dcb185e3fc432c6fa59ff02abaed066f927f223d82e60f5047c5e38",
      },
    );
    assert.deepEqual(
      JSON.parse(
        readFileSync(
          join(root, "irrelevant", "candidate", "perspective.json"),
          "utf8",
        ),
      ),
      {
        id: "perspective-irrelevant",
        pairId: "perspective-pair-irrelevant",
        content:
          "Prefer short written updates before recurring status meetings.",
        digest:
          "sha256:8f24cd050a46fb6d2e9d28b8c6f638743205df18bc2fdbcce552e5d323709e65",
      },
    );
  });
});

test("same case and condition produce byte-identical Harbor trees and digests", () => {
  withTemporaryDirectory((root) => {
    const first = project(join(root, "first"));
    const second = project(join(root, "second"));

    assert.deepEqual(
      fileTree(join(root, "first", "candidate")),
      fileTree(join(root, "second", "candidate")),
    );
    assert.deepEqual(
      fileTree(join(root, "first", "verifier")),
      fileTree(join(root, "second", "verifier")),
    );
    assert.deepEqual(
      {
        sourceDigest: first.sourceDigest,
        candidateDigest: first.candidateDigest,
        verifierDigest: first.verifierDigest,
        projectionDigest: first.projectionDigest,
      },
      {
        sourceDigest: second.sourceDigest,
        candidateDigest: second.candidateDigest,
        verifierDigest: second.verifierDigest,
        projectionDigest: second.projectionDigest,
      },
    );
  });
});

test("the real Harbor verifier accepts Oracle and rejects each critical candidate artifact", () => {
  withTemporaryDirectory((root) => {
    const projectionRoot = join(root, "projection");
    project(projectionRoot);

    const oracleArtifact = copyProjectedOracle(root, projectionRoot);
    const oracle = runHarborVerifier(projectionRoot, oracleArtifact);
    assert.equal(oracle.status, 0, oracle.stderr);
    assert.deepEqual(JSON.parse(oracle.stdout), {
      accepted: true,
      criticalFailure: false,
      reasons: [],
      state: "unmeasured",
    });
    assert.equal(statSync(oracleArtifact).mode & 0o222, 0);

    const expected = {
      "no-op": { state: "candidate_invalid", criticalFailure: false },
      "list-all": { state: "candidate_failure", criticalFailure: false },
      echo: { state: "candidate_failure", criticalFailure: false },
      malformed: { state: "candidate_invalid", criticalFailure: false },
      "judgment-access": { state: "candidate_failure", criticalFailure: true },
    } as const;
    for (const [name, verdict] of Object.entries(expected)) {
      const result = runHarborVerifier(
        projectionRoot,
        copyArtifact(root, name),
      );
      assert.equal(result.status, 1, `${name}: ${result.stderr}`);
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      assert.equal(parsed.accepted, false, name);
      assert.equal(parsed.state, verdict.state, name);
      assert.equal(parsed.criticalFailure, verdict.criticalFailure, name);
    }
  });
});

test("the verifier ignores untrusted Harbor artifact files outside the declared output", () => {
  withTemporaryDirectory((root) => {
    const projectionRoot = join(root, "projection");
    project(projectionRoot);
    const verifierRoot = join(root, "simulated-verifier");
    const artifact = join(verifierRoot, "app", "output.json");
    const maliciousArtifact = join(
      verifierRoot,
      "logs",
      "artifacts",
      "answer.json",
    );
    mkdirSync(join(verifierRoot, "app"), { recursive: true });
    mkdirSync(join(verifierRoot, "logs", "artifacts"), { recursive: true });
    cpSync(join(projectionRoot, "verifier", "oracle.json"), artifact);
    writeFileSync(
      maliciousArtifact,
      '{"answer":"preserve-focus","evidence":["calendar"]}\n',
      "utf8",
    );

    const baseline = runHarborVerifier(
      projectionRoot,
      copyProjectedOracle(root, projectionRoot),
    );
    const simulated = runHarborVerifier(projectionRoot, artifact);
    assert.equal(simulated.status, baseline.status, simulated.stderr);
    assert.equal(simulated.stdout, baseline.stdout);

    const audited = auditVerifierReads(
      projectionRoot,
      join(projectionRoot, "harbor", "tests", "judgment.json"),
      artifact,
    );
    assert.equal(audited.status, 0, audited.stderr);
    const record = JSON.parse(
      audited.stdout.trim().split("\n").at(-1) ?? "",
    ) as {
      readonly events: ReadonlyArray<readonly [string, string]>;
      readonly status: number;
    };
    assert.equal(record.status, 0);
    assert.deepEqual(record.events, [
      ["open", join(projectionRoot, "harbor", "tests", "judgment.json")],
      ["open", artifact],
    ]);
    assert.equal(
      record.events.some(([, path]) => path === maliciousArtifact),
      false,
    );
  });
});

test("the verifier rejects a validly rehashed artifact with the wrong trial identity", () => {
  withTemporaryDirectory((root) => {
    const projectionRoot = join(root, "projection");
    project(projectionRoot);
    const artifact = writeProjectedArtifact(
      root,
      projectionRoot,
      "wrong-trial-id",
      (value) => {
        const manifest = value.manifest as Record<string, unknown>;
        manifest.trialId = `trial-${"f".repeat(64)}`;
      },
    );

    const result = runHarborVerifier(projectionRoot, artifact);

    assert.equal(result.status, 1, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {
      accepted: false,
      criticalFailure: false,
      reasons: ["decision manifest trialId does not match judgment"],
      state: "candidate_invalid",
    });
  });
});

test("the verifier rejects changed digests, duplicate evidence, and semantic copies with valid manifests", () => {
  withTemporaryDirectory((root) => {
    const projectionRoot = join(root, "projection");
    project(projectionRoot);
    const candidate = join(projectionRoot, "candidate");
    const tampered = writeValidArtifact(root, "digest-tampered", () => {});
    const tamperedValue = JSON.parse(readFileSync(tampered, "utf8")) as Record<
      string,
      unknown
    >;
    (tamperedValue.manifest as Record<string, unknown>).artifactDigest =
      `sha256:${"0".repeat(64)}`;
    writeFileSync(
      tampered,
      `${JSON.stringify(tamperedValue, null, 2)}\n`,
      "utf8",
    );
    const cases = [
      ["digest-tampered", tampered],
      [
        "duplicate-evidence",
        writeValidArtifact(root, "duplicate-evidence", (value) => {
          const decisions = (value.manifest as Record<string, unknown>)
            .decisions as Array<Record<string, unknown>>;
          decisions[0]!.evidenceRefs = ["calendar", "calendar"];
        }),
      ],
      [
        "copied-task",
        writeValidArtifact(root, "copied-task", (value) => {
          value.response = readFileSync(join(candidate, "task.json"), "utf8");
        }),
      ],
      [
        "copied-evidence",
        writeValidArtifact(root, "copied-evidence", (value) => {
          value.response = readFileSync(
            join(candidate, "evidence.json"),
            "utf8",
          );
        }),
      ],
      [
        "copied-output-contract",
        writeValidArtifact(root, "copied-output-contract", (value) => {
          value.response = readFileSync(
            join(candidate, "output-contract.json"),
            "utf8",
          );
        }),
      ],
      [
        "copied-perspective",
        writeValidArtifact(root, "copied-perspective", (value) => {
          value.response = readFileSync(
            join(candidate, "perspective.json"),
            "utf8",
          );
        }),
      ],
      [
        "enumerated-regions",
        writeValidArtifact(root, "enumerated-regions", (value) => {
          value.response = "Accepted regions: preserve-focus; cite-sources.";
        }),
      ],
    ] as const;
    for (const [name, artifact] of cases) {
      const result = runHarborVerifier(projectionRoot, artifact);
      assert.equal(result.status, 1, `${name}: ${result.stderr}`);
      assert.equal(JSON.parse(result.stdout).accepted, false, name);
    }
  });
});

test("project CLI JSON is stable", () => {
  withTemporaryDirectory((root) => {
    const projectionRoot = join(root, "projection");
    const first = runCli([
      "project",
      join(fixturesRoot, "case.json"),
      "a",
      projectionRoot,
    ]);
    const second = runCli([
      "project",
      join(fixturesRoot, "case.json"),
      "a",
      projectionRoot,
    ]);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout, second.stdout);
  });
});

test("project CLI rejects malformed source input with stable invalid JSON", () => {
  withTemporaryDirectory((root) => {
    const result = runCli([
      "project",
      join(fixturesRoot, "malformed-case.json"),
      "a",
      join(root, "projection"),
    ]);

    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stdout), {
      state: "invalid",
      error: "sourceDigest must be a sha256 digest",
    });
  });
});

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const forbiddenBenchmarkDirectories = [
  "cases",
  "candidates",
  "datasets",
  "eval",
  "metrics",
  "pilots",
  "results",
  "runners",
  "scorers",
  "tasks",
  "verifiers",
];
const publicDocumentClaims = [
  ["AGENTS.md", "\nTask: preference ranking\n"],
  ["README.md", "\n## Dataset\n"],
  ["SECURITY.md", "\nMetric = 0.92\n"],
  ["docs/quality-map.md", "\nScore: 95\n"],
  ["docs/validity/activation-criteria.md", "\nResult = accepted\n"],
  [".github/PULL_REQUEST_TEMPLATE.md", "\n## Leaderboard\n"],
];
const markdownClaimVariants = [
  ["list declaration", "\n- Task: preference ranking\n"],
  ["heading suffix", "\n## Results by model\n"],
  ["inline-code status", "\nRepository status: `active`.\n"],
  ["bold list declaration", "\n- **Task**: preference ranking\n"],
  ["bold heading suffix", "\n## **Results** by model\n"],
  ["bold status", "\nRepository status: **active**.\n"],
];
const experimentalRootFixtures = [
  ["bank/experimental-case.md", "# Experimental case\n"],
  ["config/experimental-config.json", "{}\n"],
  ["docs/superpowers/specs/experimental-design.md", "# Experimental design\n"],
  ["docs/validity/experimental-method.md", "# Experimental method\n"],
  ["harbor/experimental-verifier.py", "print('experimental')\n"],
  ["perspectives/experimental-perspective.md", "# Experimental perspective\n"],
  ["schemas/experimental.schema.json", "{}\n"],
  ["src/experimental-boundary.mjs", "export const status = 'not_active';\n"],
  ["tests/experimental-contract.mjs", "export {}\n"],
  ["tests/fixtures/experimental-case.json", "{}\n"],
];
function check(repository) {
  return spawnSync(
    process.execPath,
    [
      join(root, "scripts", "check-inactive-boundary.mjs"),
      "--root",
      repository,
    ],
    { encoding: "utf8" },
  );
}
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "inactive-benchmark-"));
  const repository = join(directory, "repository");
  cpSync(root, repository, {
    recursive: true,
    filter: (path) =>
      ![".git", "node_modules"].includes(path.split("/").at(-1)),
  });
  execFileSync("git", ["init", "--quiet"], { cwd: repository });
  execFileSync("git", ["add", "--all"], { cwd: repository });
  return { directory, repository };
}
function withFixture(assertion) {
  const temp = fixture();
  try {
    assertion(temp.repository);
  } finally {
    rmSync(temp.directory, { force: true, recursive: true });
  }
}
test("accepts the declared not_active repository boundary", () => {
  withFixture((repository) => {
    const result = check(repository);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /"repository_status":"not_active"/u);
  });
});

test("accepts each declared experimental root while not_active", () => {
  withFixture((repository) => {
    for (const [path, content] of experimentalRootFixtures) {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), content);
      execFileSync("git", ["add", path], { cwd: repository });
    }

    const result = check(repository);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});

test("accepts committed SDD task evidence without treating it as benchmark evidence", () => {
  withFixture((repository) => {
    const path = ".superpowers/sdd/example/task-4c2-report.md";
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(
      join(repository, path),
      "# Task 4C2 report\n\nThis is implementation evidence, not a benchmark result.\n",
    );
    const ledger = ".superpowers/sdd/example/progress.md";
    writeFileSync(
      join(repository, ledger),
      "# SDD ledger\n\nTask 4C2: complete.\n",
    );
    execFileSync("git", ["add", "-f", path, ledger], { cwd: repository });

    const result = check(repository);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});

test("rejects measured result roles before allowing JSON fixtures", () => {
  withFixture((repository) => {
    const fixtureRoot = join(repository, "tests", "fixtures");
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(
      join(fixtureRoot, "source.json"),
      '{"artifact_type":"case_source","case_id":"case-001"}\n',
    );
    execFileSync("git", ["add", "tests/fixtures/source.json"], {
      cwd: repository,
    });

    const source = check(repository);
    assert.equal(source.status, 0, source.stderr || source.stdout);

    writeFileSync(
      join(fixtureRoot, "result.json"),
      '{"artifact_type":"benchmark_result","result_state":"measured"}\n',
    );
    execFileSync("git", ["add", "tests/fixtures/result.json"], {
      cwd: repository,
    });

    const result = check(repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /forbidden measured benchmark artifact/u);
  });
});

test("accepts malformed candidate-artifact fixtures without skipping role checks", () => {
  withFixture((repository) => {
    const path = "tests/fixtures/malformed-candidate-artifact.json";
    writeFileSync(join(repository, path), '{"manifest":\n');
    execFileSync("git", ["add", path], { cwd: repository });

    const result = check(repository);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});

test("rejects an unclassified experimental run artifact", () => {
  withFixture((repository) => {
    mkdirSync(join(repository, "docs", "validity", "evidence"));
    writeFileSync(
      join(repository, "docs", "validity", "evidence", "run-001.json"),
      "{}\n",
    );
    execFileSync("git", ["add", "docs/validity/evidence"], { cwd: repository });

    const result = check(repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unclassified experimental JSON artifact/u);
  });
});

test("accepts a results schema in the schema role", () => {
  withFixture((repository) => {
    mkdirSync(join(repository, "schemas"), { recursive: true });
    writeFileSync(
      join(repository, "schemas", "results.schema.json"),
      '{"type":"object"}\n',
    );
    execFileSync("git", ["add", "schemas/results.schema.json"], {
      cwd: repository,
    });

    const result = check(repository);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});

test("rejects measured benchmark payloads under source and config roots", () => {
  for (const rootName of ["bank", "config", "perspectives"]) {
    withFixture((repository) => {
      const path = `${rootName}/run-001.json`;
      mkdirSync(join(repository, rootName), { recursive: true });
      writeFileSync(
        join(repository, path),
        '{"artifact_type":"benchmark_run","result_state":"measured","results":[]}\n',
      );
      execFileSync("git", ["add", path], { cwd: repository });

      const result = check(repository);
      assert.notEqual(result.status, 0, rootName);
      assert.match(
        result.stderr,
        /forbidden measured benchmark artifact/u,
        rootName,
      );
    });
  }
});

test("accepts legitimate source and configuration JSON by declared role", () => {
  const artifacts = [
    [
      "bank/run-001.json",
      '{"artifact_type":"case_source","case_id":"case-001"}\n',
    ],
    [
      "config/results.json",
      '{"artifact_type":"judge_configuration","models":[]}\n',
    ],
    [
      "perspectives/catalog.json",
      '{"artifact_type":"perspective_source","pairs":[]}\n',
    ],
  ];

  for (const [path, content] of artifacts) {
    withFixture((repository) => {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), content);
      execFileSync("git", ["add", path], { cwd: repository });

      const result = check(repository);
      assert.equal(result.status, 0, result.stderr || path);
    });
  }
});

test("rejects concrete claims in experimental documentation", () => {
  const claims = [
    ["active", "\nRepository status: active\n"],
    ["measured", "\nMeasured result: 0.95\n"],
    ["leaderboard", "\n## Leaderboard\n"],
    ["Product credit", "\nProduct credit: Coffee Chat\n"],
  ];

  for (const [name, claim] of claims) {
    withFixture((repository) => {
      const document = join(
        repository,
        "docs",
        "superpowers",
        "specs",
        "claim.md",
      );
      writeFileSync(document, `# Experimental claim fixture\n${claim}`);
      execFileSync("git", ["add", "docs/superpowers/specs/claim.md"], {
        cwd: repository,
      });

      const result = check(repository);
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, /concrete benchmark claim/u, name);
    });
  }
});

test("rejects candidate and Product-specific module imports in every executable root", () => {
  const imports = [
    [
      "candidate",
      "src/experimental-import.mjs",
      'import candidate from "candidate-private";\n',
    ],
    [
      "Product",
      "src/experimental-import.mjs",
      'import product from "coffee-chat";\n',
    ],
    [
      "re-export",
      "src/experimental-export.mjs",
      'export { candidate } from "candidate-private";\n',
    ],
    [
      "dynamic import",
      "config/experimental-loader.mjs",
      'await import("coffee-chat");\n',
    ],
    [
      "Harbor",
      "harbor/experimental-verifier.py",
      "from candidate_private import verify\n",
    ],
  ];

  for (const [name, path, source] of imports) {
    withFixture((repository) => {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), source);
      execFileSync("git", ["add", path], { cwd: repository });

      const result = check(repository);
      assert.notEqual(result.status, 0, name);
      assert.match(
        result.stderr,
        /forbidden candidate or Product-specific import/u,
        name,
      );
    });
  }
});

test("ignores module-like text in executable comments and strings", () => {
  withFixture((repository) => {
    mkdirSync(join(repository, "src"), { recursive: true });
    writeFileSync(
      join(repository, "src", "experimental-comment.mjs"),
      "// import candidate from 'candidate-private';\nconst note = \"import('coffee-chat')\";\n",
    );
    execFileSync("git", ["add", "src/experimental-comment.mjs"], {
      cwd: repository,
    });

    const result = check(repository);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});

test("rejects Python dynamic and comma-separated candidate imports in every executable root", () => {
  const sources = [
    [
      "dynamic import",
      'import importlib\nimportlib.import_module("coffee_chat")\n',
    ],
    ["comma-separated import", "import safe_module, candidate_private\n"],
  ];

  for (const rootName of ["config", "harbor", "src", "tests"]) {
    for (const [name, source] of sources) {
      withFixture((repository) => {
        const path = `${rootName}/experimental_import.py`;
        mkdirSync(join(repository, rootName), { recursive: true });
        writeFileSync(join(repository, path), source);
        execFileSync("git", ["add", path], { cwd: repository });

        const result = check(repository);
        assert.notEqual(result.status, 0, `${rootName}: ${name}`);
        assert.match(
          result.stderr,
          /forbidden candidate or Product-specific import/u,
          `${rootName}: ${name}`,
        );
      });
    }
  }
});

test("ignores Python dynamic-import text in comments and ordinary strings", () => {
  withFixture((repository) => {
    mkdirSync(join(repository, "harbor"), { recursive: true });
    writeFileSync(
      join(repository, "harbor", "experimental_comment.py"),
      "# importlib.import_module(\"coffee_chat\")\nnote = 'import safe_module, candidate_private'\n",
    );
    execFileSync("git", ["add", "harbor/experimental_comment.py"], {
      cwd: repository,
    });

    const result = check(repository);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});

test("delegates author eligibility to the immutable central gate", () => {
  const wrapper = readFileSync(
    join(root, ".github", "workflows", "trusted.yml"),
    "utf8",
  );
  const controlSha = wrapper.match(
    /uses: openboa-ai\/\.github\/\.github\/workflows\/coffee-trusted-gate\.yml@([0-9a-f]{40})/u,
  )?.[1];
  assert.ok(controlSha);
  assert.match(wrapper, /pull_request_target:/u);
  assert.match(wrapper, new RegExp(`control_sha: ${controlSha}`, "u"));
  assert.doesNotMatch(wrapper, /^\s*run:/mu);
});

test("requires the public not_active status in each public boundary document", () => {
  for (const path of ["AGENTS.md", "README.md"]) {
    withFixture((repository) => {
      const document = join(repository, path);
      writeFileSync(
        document,
        readFileSync(document, "utf8").replaceAll("not_active", "inactive"),
      );

      const result = check(repository);
      assert.notEqual(result.status, 0, path);
      assert.match(result.stderr, /missing public not_active status/u, path);
    });
  }
});
test("rejects concrete benchmark claims in every public document", () => {
  for (const [path, claim] of publicDocumentClaims) {
    withFixture((repository) => {
      const document = join(repository, path);
      writeFileSync(document, `${readFileSync(document, "utf8")}${claim}`);

      const result = check(repository);
      assert.notEqual(result.status, 0, path);
      assert.match(result.stderr, /concrete benchmark claim/u, path);
    });
  }
});

test("rejects an active repository-status declaration", () => {
  withFixture((repository) => {
    const document = join(repository, "README.md");
    writeFileSync(
      document,
      `${readFileSync(document, "utf8")}\nRepository status: active\n`,
    );

    const result = check(repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /concrete benchmark claim/u);
  });
});

test("rejects normalized Markdown forms of concrete claims", () => {
  for (const [name, claim] of markdownClaimVariants) {
    withFixture((repository) => {
      const document = join(repository, "README.md");
      writeFileSync(document, `${readFileSync(document, "utf8")}${claim}`);

      const result = check(repository);
      assert.notEqual(result.status, 0, name);
      assert.match(result.stderr, /concrete benchmark claim/u, name);
    });
  }
});

test("rejects every unlabelled benchmark-bearing directory category", () => {
  for (const directory of forbiddenBenchmarkDirectories) {
    withFixture((repository) => {
      mkdirSync(join(repository, directory));
      writeFileSync(
        join(repository, directory, "placeholder.md"),
        "absent\n",
        {},
      );
      execFileSync("git", ["add", directory], { cwd: repository });

      const result = check(repository);
      assert.notEqual(result.status, 0, directory);
      assert.match(
        result.stderr,
        /forbidden benchmark path|forbidden path/u,
        directory,
      );
    });
  }
});

test("rejects an unapproved executable source", () => {
  withFixture((repository) => {
    writeFileSync(
      join(repository, "scripts", "runner.mjs"),
      "process.stdout.write('benchmark');\n",
    );
    execFileSync("git", ["add", "scripts/runner.mjs"], { cwd: repository });

    const result = check(repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unapproved path/u);
  });
});

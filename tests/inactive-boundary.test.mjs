import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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
  [
    "docs/validity/validity-argument-and-evidence-plan.md",
    "\nResult = accepted\n",
  ],
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
  ["docs/experimental-design.md", "# Experimental design\n"],
  ["docs/validity/experimental-method.md", "# Experimental method\n"],
  ["harbor/experimental-verifier.py", "print('experimental')\n"],
  ["qualification/experimental-protocol.md", "# Experimental protocol\n"],
  ["schemas/experimental.schema.json", "{}\n"],
  ["src/experimental-boundary.mjs", "export const status = 'not_active';\n"],
  ["tests/experimental-contract.mjs", "export {}\n"],
  ["tests/fixtures/experimental-case.json", "{}\n"],
];
const immutableCampaignHistoryRoots = [
  "qualification/hill-climbing/mini",
  "qualification/hill-climbing/steps",
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
    filter: (path) => {
      if ([".git", "node_modules"].includes(path.split("/").at(-1)))
        return false;
      const repositoryPath = relative(root, path).replaceAll("\\", "/");
      return !immutableCampaignHistoryRoots.some(
        (campaignRoot) =>
          repositoryPath === campaignRoot ||
          repositoryPath.startsWith(`${campaignRoot}/`),
      );
    },
  });
  symlinkSync(
    join(root, "node_modules"),
    join(directory, "node_modules"),
    "dir",
  );
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
test("mutation fixtures exclude immutable campaign step history", () => {
  withFixture((repository) => {
    assert.equal(
      existsSync(join(repository, "qualification", "hill-climbing", "steps")),
      false,
    );
    assert.equal(
      existsSync(join(repository, "qualification", "hill-climbing", "mini")),
      false,
    );
  });
});
test("accepts the declared not_active repository boundary", () => {
  const result = check(root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /"repository_status":"not_active"/u);
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
    mkdirSync(dirname(join(repository, path)), { recursive: true });
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

test("rejects measured benchmark payloads under source roots", () => {
  for (const rootName of ["bank", "qualification"]) {
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

test("accepts legitimate source JSON by declared role", () => {
  const artifacts = [
    [
      "bank/run-001.json",
      '{"artifact_type":"case_source","case_id":"case-001"}\n',
    ],
    [
      "qualification/control.json",
      '{"artifact_type":"qualification_source","models":[]}\n',
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

test("rejects result-bearing fields in fixed public bank evidence", () => {
  for (const [path, mutate] of [
    [
      "OVERLAP-REPORT.json",
      (content) => ({ ...JSON.parse(content), result_state: "measured" }),
    ],
    [
      "CONTAMINATION.jsonl",
      (content) => {
        const rows = content.trim().split("\n").map(JSON.parse);
        rows[0].score = 1;
        return rows;
      },
    ],
    [
      "RIGHTS-PROVENANCE.jsonl",
      (content) => {
        const rows = content.trim().split("\n").map(JSON.parse);
        rows[0].artifact_type = "benchmark_result";
        return rows;
      },
    ],
  ]) {
    withFixture((repository) => {
      const target = join(repository, path);
      const mutated = mutate(readFileSync(target, "utf8"));
      writeFileSync(
        target,
        path.endsWith(".jsonl")
          ? `${mutated.map(JSON.stringify).join("\n")}\n`
          : `${JSON.stringify(mutated)}\n`,
      );

      const result = check(repository);
      assert.notEqual(result.status, 0, path);
      assert.match(result.stderr, /invalid public bank evidence/u, path);
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
      const document = join(repository, "docs", "claim.md");
      writeFileSync(document, `# Experimental claim fixture\n${claim}`);
      execFileSync("git", ["add", "docs/claim.md"], {
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

test("rejects an untracked non-ignored candidate or Product import", () => {
  withFixture((repository) => {
    const path = join(repository, "src", "untracked-product-import.mjs");
    writeFileSync(path, 'import product from "coffee-chat";\n');

    const result = check(repository);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /forbidden candidate or Product-specific import: src\/untracked-product-import\.mjs/u,
    );
  });
});

test("rejects untracked nonliteral JavaScript dynamic imports", () => {
  for (const [name, source] of [
    ["import", "const name = process.env.MODULE; await import(name);\n"],
    ["require", "const name = process.env.MODULE; require(name);\n"],
  ]) {
    withFixture((repository) => {
      const path = join(repository, "src", `computed-${name}.mjs`);
      writeFileSync(path, source);

      const result = check(repository);
      assert.notEqual(result.status, 0, name);
      assert.match(
        result.stderr,
        new RegExp(
          `nonliteral dynamic import: src/computed-${name}\\.mjs`,
          "u",
        ),
        name,
      );
    });
  }
});

for (const [name, source] of [
  [
    "initializer",
    'const r = require;\nconst moduleApi = r("node:module");\nconst makeRequire = moduleApi.createRequire;\nmakeRequire(__filename)("coffee-chat");\n',
  ],
  ["assignment", 'let load;\nload = require;\nload("coffee-chat");\n'],
  [
    "destructuring",
    'const { load } = { load: require };\nload("coffee-chat");\n',
  ],
  [
    "argument",
    'const keep = (value) => value;\nconst load = keep(require);\nload("coffee-chat");\n',
  ],
  [
    "return",
    'function expose() { return require; }\nexpose()("coffee-chat");\n',
  ],
  ["export", "export { require };\n"],
]) {
  test(`rejects an untracked bare global require ${name} capability`, () => {
    withFixture((repository) => {
      const fixturePath = `src/require-capability-${name}.cjs`;
      writeFileSync(join(repository, fixturePath), source);

      const result = check(repository);
      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        new RegExp(`global require capability: ${fixturePath}\\b`, "u"),
      );
    });
  });
}

test("accepts direct literal require and lexically shadowed require identifiers", () => {
  withFixture((repository) => {
    writeFileSync(
      join(repository, "src", "literal-require.cjs"),
      'const fs = require("node:fs");\n',
    );
    writeFileSync(
      join(repository, "src", "require-syntax-only.mjs"),
      'const record = { require: "metadata" };\nrecord.require;\n',
    );
    writeFileSync(
      join(repository, "src", "local-require.cjs"),
      'const require = (specifier) => specifier;\nconst load = require;\nload("coffee-chat");\nrequire("coffee-chat");\n',
    );
    writeFileSync(
      join(repository, "src", "parameter-require.mjs"),
      'export function load(require) {\n  const alias = require;\n  return [alias("coffee-chat"), require("coffee-chat")];\n}\n',
    );

    const result = check(repository);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});

test("rejects untracked createRequire capabilities and aliases", () => {
  for (const [name, source] of [
    [
      "direct",
      'import { createRequire } from "node:module";\nconst load = createRequire(import.meta.url);\n',
    ],
    [
      "aliased",
      'import { createRequire as makeRequire } from "module";\nconst load = makeRequire(import.meta.url);\n',
    ],
    [
      "namespace",
      'import * as moduleApi from "node:module";\nconst load = moduleApi.createRequire(import.meta.url);\n',
    ],
  ]) {
    withFixture((repository) => {
      const path = join(repository, "src", `create-require-${name}.ts`);
      writeFileSync(path, source);

      const result = check(repository);
      assert.notEqual(result.status, 0, name);
      assert.match(
        result.stderr,
        new RegExp(
          `createRequire capability: src/create-require-${name}\\.ts`,
          "u",
        ),
        name,
      );
    });
  }
});

test("accepts normal named node:module imports", () => {
  withFixture((repository) => {
    writeFileSync(
      join(repository, "src", "static-node-module.ts"),
      'import { builtinModules, isBuiltin } from "node:module";\nexport const builtins = builtinModules.filter(isBuiltin);\n',
    );

    const result = check(repository);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});

test("rejects untracked nonliteral Python dynamic imports", () => {
  for (const [name, source] of [
    [
      "importlib",
      "import importlib\nname = get_module_name()\nimportlib.import_module(name)\n",
    ],
    ["dunder", "name = get_module_name()\n__import__(name)\n"],
  ]) {
    withFixture((repository) => {
      const path = join(repository, "src", `computed-${name}.py`);
      writeFileSync(path, source);

      const result = check(repository);
      assert.notEqual(result.status, 0, name);
      assert.match(
        result.stderr,
        new RegExp(`nonliteral dynamic import: src/computed-${name}\\.py`, "u"),
        name,
      );
    });
  }
});

test("accepts literal JavaScript dynamic imports and normal static Python imports", () => {
  withFixture((repository) => {
    writeFileSync(
      join(repository, "src", "literal-dynamic.mjs"),
      'await import("node:path");\nawait import(`node:url`);\nawait import("fixture.json", { with: { type: "json" } });\nrequire("node:crypto");\n',
    );
    writeFileSync(
      join(repository, "src", "literal_dynamic.py"),
      "import json\nfrom pathlib import Path\n",
    );

    const result = check(repository);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});

test("rejects untracked Python dynamic-loader imports and aliases", () => {
  for (const [name, source] of [
    [
      "from-import",
      "from importlib import import_module\nname = get_module_name()\nimport_module(name)\n",
    ],
    [
      "aliased-from-import",
      "from importlib import import_module as load\nname = get_module_name()\nload(name)\n",
    ],
    [
      "aliased-module",
      "import importlib as loader\nname = get_module_name()\nloader.import_module(name)\n",
    ],
    [
      "aliased-builtins",
      "from builtins import __import__ as load\nname = get_module_name()\nload(name)\n",
    ],
    ["direct", "name = get_module_name()\nimport_module(name)\n"],
  ]) {
    withFixture((repository) => {
      const path = join(repository, "src", `loader-${name}.py`);
      writeFileSync(path, source);

      const result = check(repository);
      assert.notEqual(result.status, 0, name);
      assert.match(
        result.stderr,
        new RegExp(`dynamic (?:import|loader).*src/loader-${name}\\.py`, "u"),
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

  for (const rootName of ["harbor", "src", "tests"]) {
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

test("keeps the current authority documents explicitly non-activating", () => {
  for (const path of [
    "README.md",
    "docs/benchmark-design.md",
    "docs/implementation-plan.md",
    "docs/quality-map.md",
    "docs/validity/validity-argument-and-evidence-plan.md",
  ]) {
    const content = readFileSync(join(root, path), "utf8");
    assert.match(content, /not_active/u, path);
    assert.doesNotMatch(content, /Repository status:\s*`?active`?/iu, path);
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
      writeFileSync(join(repository, directory, "evidence.md"), "absent\n", {});
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
      join(repository, "runner.mjs"),
      "process.stdout.write('benchmark');\n",
    );
    execFileSync("git", ["add", "runner.mjs"], { cwd: repository });

    const result = check(repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unapproved path/u);
  });
});

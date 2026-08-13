import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

test("documents GitHub-native selective-review auto-merge", async () => {
  const [agentContract, pullRequestTemplate] = await Promise.all([
    readFile(join(repositoryRoot, "AGENTS.md"), "utf8"),
    readFile(join(repositoryRoot, ".github/PULL_REQUEST_TEMPLATE.md"), "utf8"),
  ]);

  assert.match(agentContract, /pull request/u);
  assert.match(agentContract, /GitHub-native squash\s+auto-merge/u);
  assert.match(agentContract, /external ruleset[\s\S]*human review/iu);
  assert.match(agentContract, /custom write-token merge automation/u);
  assert.doesNotMatch(agentContract, /Human approval is not required/u);
  assert.match(pullRequestTemplate, /Sensitive path/u);
  assert.match(pullRequestTemplate, /GitHub-native squash auto-merge/u);
});

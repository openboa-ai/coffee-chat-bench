import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { parseCaseBundle, parseJudgeVote } from "../src/contracts.ts";
import {
  buildCanonicalJudgePanelInput,
  createAttestationMac,
  createExecutionCapabilityKey,
  judgeProjection,
  type CanonicalJudgeInput,
} from "../src/judgment.ts";
import type { JudgeTransport } from "../src/openai-judge.ts";
import { projectHarborTask } from "../src/projector.ts";

const fixturesRoot = join(import.meta.dirname, "fixtures", "projection");
const repositoryRoot = resolve(import.meta.dirname, "..");
const capabilityKey = createExecutionCapabilityKey();

function temporaryDirectory(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "coffee-chat-judgment-")));
}

function withProjection(
  assertion: (root: string, projection: string) => Promise<void> | void,
): Promise<void> {
  const root = temporaryDirectory();
  const projection = join(root, "projection");
  projectHarborTask(
    parseCaseBundle(
      JSON.parse(readFileSync(join(fixturesRoot, "case.json"), "utf8")),
    ),
    "a",
    projection,
  );
  return Promise.resolve(assertion(root, projection)).finally(() =>
    rmSync(root, { force: true, recursive: true }),
  );
}

function artifact(root: string, projection: string, name: string): string {
  const destination = join(root, `${name}.json`);
  const source =
    name === "oracle"
      ? join(projection, "verifier", "oracle.json")
      : join(fixturesRoot, "artifacts", `${name}.json`);
  cpSync(source, destination);
  return destination;
}

function attestation(
  root: string,
  projection: string,
  artifactPath: string,
  state:
    | "unmeasured"
    | "candidate_invalid"
    | "candidate_failure"
    | "verifier_failure" = "unmeasured",
  mutate: (value: Record<string, unknown>) => void = () => {},
): string {
  const metadata = JSON.parse(
    readFileSync(join(projection, "projection.json"), "utf8"),
  ) as Record<string, string>;
  const task = JSON.parse(
    readFileSync(join(projection, "candidate", "task.json"), "utf8"),
  ) as Record<string, string>;
  let parsedArtifact: { manifest?: { artifactDigest?: string } } = {};
  if (existsSync(artifactPath)) {
    try {
      parsedArtifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
        manifest?: { artifactDigest?: string };
      };
    } catch {
      // The production boundary must classify malformed candidate artifacts.
    }
  }
  const value: Record<string, unknown> = {
    artifactType: "isolated_verifier_attestation",
    issuer: "openboa-ai/coffee-chat-eval",
    release: "2026.8.12",
    benchRepository: "openboa-ai/coffee-chat-bench",
    benchCommit: "d769abb8ba78a04c50a58b12f107f4fb4ec32612",
    bankDigest:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    trialId: task.trialId,
    caseId: task.caseId,
    condition: task.condition,
    sourceDigest: task.sourceDigest,
    candidateDigest: metadata.candidateDigest,
    verifierDigest: metadata.verifierDigest,
    projectionDigest: metadata.projectionDigest,
    artifactDigest:
      parsedArtifact.manifest?.artifactDigest ??
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    state,
    accepted: state === "unmeasured",
    criticalFailure: false,
    reasonCode: state === "unmeasured" ? "none" : state,
    isolation: {
      network: {
        taskBaseline: "no-network",
        setup: {
          policy: "allowlist",
          hosts: ["dl-cdn.alpinelinux.org", "registry.npmjs.org"],
        },
        agent: {
          policy: "allowlist",
          hosts: ["api.openai.com"],
        },
        verifierBaseline: "no-network",
        verifierPhase: "no-network",
      },
      candidateInputs: "candidate_projection_only",
      verifierJudgment: "verifier_only",
      transferredArtifacts: ["/app/output.json"],
      cleanup: "completed",
    },
  };
  mutate(value);
  value.attestationMac = createAttestationMac(value, capabilityKey);
  const destination = join(root, `attestation-${Math.random()}.json`);
  writeFileSync(destination, JSON.stringify(value), "utf8");
  return destination;
}

function vote(model: string, dimensions = {}) {
  return {
    state: "response" as const,
    resolvedModel: model,
    body: {
      taskAdequate: true,
      evidenceIntegrity: true,
      perspectiveAligned: true,
      invariantsPreserved: true,
      criticalFailure: false,
      ...dimensions,
    },
    usage: { inputTokens: 100, outputTokens: 50 },
  };
}

function acceptedTransport(calls: string[]): JudgeTransport {
  return {
    async request(request) {
      calls.push(request.model);
      return vote(request.model);
    },
  };
}

test("accepted Oracle projection calls exactly Terra and Luna and emits only public judgment data", async () => {
  await withProjection(async (root, projection) => {
    const calls: string[] = [];
    const result = await judgeProjection({
      projectionRoot: projection,
      artifactPath: artifact(root, projection, "oracle"),
      attestationPath: attestation(
        root,
        projection,
        artifact(root, projection, "oracle"),
      ),
      capabilityKey,
      transport: acceptedTransport(calls),
    });

    assert.deepEqual(calls, ["gpt-5.6-terra", "gpt-5.6-luna"]);
    assert.equal(result.state, "measured");
    assert.equal(result.deterministic.state, "unmeasured");
    assert.deepEqual(result.provenance?.network, {
      taskBaseline: "no-network",
      setup: {
        policy: "allowlist",
        hosts: ["dl-cdn.alpinelinux.org", "registry.npmjs.org"],
      },
      agent: { policy: "allowlist", hosts: ["api.openai.com"] },
      verifierBaseline: "no-network",
      verifierPhase: "no-network",
    });
    assert.deepEqual(
      result.publicVotes.map(parseJudgeVote),
      result.publicVotes,
    );
    assert.match(result.resultDigest, /^sha256:[0-9a-f]{64}$/);
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "OPENAI_API_KEY",
      "Authorization",
      "Bearer ",
      "pcda-qpcfr-2026.8.12",
      "Oracle artifact.",
    ]) {
      assert.equal(serialized.includes(forbidden), false, forbidden);
    }
  });
});

test("public attest CLI signs once without exposing its capability", async () => {
  await withProjection(async (root, projection) => {
    const oracle = artifact(root, projection, "oracle");
    const signedFixture = attestation(root, projection, oracle);
    const unsigned = JSON.parse(readFileSync(signedFixture, "utf8")) as Record<
      string,
      unknown
    >;
    delete unsigned.attestationMac;
    const unsignedPath = join(root, "unsigned-attestation.json");
    const signedPath = join(root, "signed-attestation.json");
    writeFileSync(unsignedPath, JSON.stringify(unsigned), "utf8");

    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        join(repositoryRoot, "src", "cli.ts"),
        "attest",
        unsignedPath,
        signedPath,
      ],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          COFFEE_CHAT_EVAL_ATTESTATION_KEY: capabilityKey,
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { state: "signed" });
    assert.equal(result.stdout.includes(capabilityKey), false);
    const signed = JSON.parse(readFileSync(signedPath, "utf8")) as Record<
      string,
      unknown
    >;
    assert.equal(
      signed.attestationMac,
      createAttestationMac(signed, capabilityKey),
    );
    assert.equal(JSON.stringify(signed).includes(capabilityKey), false);
    assert.equal(lstatSync(signedPath).mode & 0o777, 0o600);
    const judged = await judgeProjection({
      projectionRoot: projection,
      artifactPath: oracle,
      attestationPath: signedPath,
      capabilityKey,
      transport: acceptedTransport([]),
    });
    assert.equal(judged.state, "measured");

    const preSignedInput = join(root, "pre-signed-attestation.json");
    writeFileSync(preSignedInput, JSON.stringify(signed), "utf8");
    const rejectedPreSigned = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        join(repositoryRoot, "src", "cli.ts"),
        "attest",
        preSignedInput,
        join(root, "must-not-exist.json"),
      ],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          COFFEE_CHAT_EVAL_ATTESTATION_KEY: capabilityKey,
        },
      },
    );
    assert.equal(rejectedPreSigned.status, 1);
    assert.equal(rejectedPreSigned.stdout.includes(capabilityKey), false);

    const missingCapability = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        join(repositoryRoot, "src", "cli.ts"),
        "attest",
        unsignedPath,
        join(root, "missing-capability.json"),
      ],
      {
        encoding: "utf8",
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      },
    );
    assert.equal(missingCapability.status, 1);
    assert.equal(missingCapability.stdout.includes(capabilityKey), false);

    const overwrite = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        join(repositoryRoot, "src", "cli.ts"),
        "attest",
        unsignedPath,
        signedPath,
      ],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          COFFEE_CHAT_EVAL_ATTESTATION_KEY: capabilityKey,
        },
      },
    );
    assert.equal(overwrite.status, 1);
    assert.equal(overwrite.stdout.includes(capabilityKey), false);
    assert.deepEqual(JSON.parse(readFileSync(signedPath, "utf8")), signed);

    const incompletePath = join(root, "incomplete-attestation.json");
    writeFileSync(
      incompletePath,
      JSON.stringify({ artifactType: "isolated_verifier_attestation" }),
      "utf8",
    );
    const rejectedIncomplete = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        join(repositoryRoot, "src", "cli.ts"),
        "attest",
        incompletePath,
        join(root, "incomplete-signed.json"),
      ],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          COFFEE_CHAT_EVAL_ATTESTATION_KEY: capabilityKey,
        },
      },
    );
    assert.equal(rejectedIncomplete.status, 1);
  });
});

test("deterministic candidate outcomes make zero provider calls", async () => {
  await withProjection(async (root, projection) => {
    for (const [name, state] of [
      ["no-op", "candidate_invalid"],
      ["malformed", "candidate_invalid"],
      ["list-all", "candidate_failure"],
      ["judgment-access", "candidate_failure"],
    ] as const) {
      let calls = 0;
      const result = await judgeProjection({
        projectionRoot: projection,
        artifactPath: artifact(root, projection, name),
        attestationPath: attestation(
          root,
          projection,
          artifact(root, projection, name),
          state,
        ),
        capabilityKey,
        transport: {
          async request() {
            calls += 1;
            throw new Error("provider must not run");
          },
        },
      });
      assert.equal(result.state, state, name);
      assert.equal(calls, 0, name);
      assert.equal(result.campaign, undefined, name);
    }
  });
});

test("missing, unbound, or broader phase-network attestations stop before provider calls", async () => {
  await withProjection(async (root, projection) => {
    const oracle = artifact(root, projection, "oracle");
    let calls = 0;
    for (const attestationPath of [
      join(root, "missing-attestation.json"),
      attestation(root, projection, oracle, "unmeasured", (value) => {
        value.artifactDigest =
          "sha256:0000000000000000000000000000000000000000000000000000000000000000";
      }),
      attestation(root, projection, oracle, "unmeasured", (value) => {
        const isolation = value.isolation as Record<string, unknown>;
        const network = isolation.network as Record<string, unknown>;
        const agent = network.agent as Record<string, unknown>;
        agent.policy = "public";
      }),
    ]) {
      const result = await judgeProjection({
        projectionRoot: projection,
        artifactPath: oracle,
        attestationPath,
        capabilityKey,
        transport: {
          async request() {
            calls += 1;
            throw new Error("provider must not run");
          },
        },
      });
      assert.equal(result.state, "verifier_failure");
    }
    assert.equal(calls, 0);
  });
});

test("phase-network attestation rejects every missing, broader, duplicate, extra, or reordered host policy", async () => {
  await withProjection(async (root, projection) => {
    const oracle = artifact(root, projection, "oracle");
    const mutations: readonly (readonly [
      string,
      (value: Record<string, unknown>) => void,
    ])[] = [
      [
        "retired candidateNetwork shape",
        (value) => {
          const isolation = value.isolation as Record<string, unknown>;
          delete isolation.network;
          isolation.candidateNetwork = "disabled";
        },
      ],
      [
        "missing network",
        (value) => {
          delete (value.isolation as Record<string, unknown>).network;
        },
      ],
      [
        "missing task baseline",
        (value) => {
          const isolation = value.isolation as Record<string, unknown>;
          delete (isolation.network as Record<string, unknown>).taskBaseline;
        },
      ],
      [
        "missing setup",
        (value) => {
          const network = (value.isolation as Record<string, unknown>)
            .network as Record<string, unknown>;
          delete network.setup;
        },
      ],
      [
        "public setup policy",
        (value) => {
          const network = (value.isolation as Record<string, unknown>)
            .network as Record<string, unknown>;
          (network.setup as Record<string, unknown>).policy = "public";
        },
      ],
      [
        "missing agent",
        (value) => {
          const network = (value.isolation as Record<string, unknown>)
            .network as Record<string, unknown>;
          delete network.agent;
        },
      ],
      [
        "missing setup host",
        (value) => {
          const network = (value.isolation as Record<string, unknown>)
            .network as Record<string, unknown>;
          (network.setup as Record<string, unknown>).hosts = [
            "dl-cdn.alpinelinux.org",
          ];
        },
      ],
      [
        "missing verifier baseline",
        (value) => {
          const network = (value.isolation as Record<string, unknown>)
            .network as Record<string, unknown>;
          delete network.verifierBaseline;
        },
      ],
      [
        "reordered setup hosts",
        (value) => {
          const network = (value.isolation as Record<string, unknown>)
            .network as Record<string, unknown>;
          (network.setup as Record<string, unknown>).hosts = [
            "registry.npmjs.org",
            "dl-cdn.alpinelinux.org",
          ];
        },
      ],
      [
        "duplicate setup host",
        (value) => {
          const network = (value.isolation as Record<string, unknown>)
            .network as Record<string, unknown>;
          (network.setup as Record<string, unknown>).hosts = [
            "dl-cdn.alpinelinux.org",
            "registry.npmjs.org",
            "registry.npmjs.org",
          ];
        },
      ],
      [
        "missing agent host",
        (value) => {
          const network = (value.isolation as Record<string, unknown>)
            .network as Record<string, unknown>;
          (network.agent as Record<string, unknown>).hosts = [];
        },
      ],
      [
        "public agent policy",
        (value) => {
          const network = (value.isolation as Record<string, unknown>)
            .network as Record<string, unknown>;
          (network.agent as Record<string, unknown>).policy = "public";
        },
      ],
      [
        "extra agent host",
        (value) => {
          const network = (value.isolation as Record<string, unknown>)
            .network as Record<string, unknown>;
          (network.agent as Record<string, unknown>).hosts = [
            "api.openai.com",
            "example.com",
          ];
        },
      ],
      [
        "broader verifier baseline",
        (value) => {
          const network = (value.isolation as Record<string, unknown>)
            .network as Record<string, unknown>;
          network.verifierBaseline = "allowlist";
        },
      ],
      [
        "missing verifier phase",
        (value) => {
          const network = (value.isolation as Record<string, unknown>)
            .network as Record<string, unknown>;
          delete network.verifierPhase;
        },
      ],
      [
        "broader verifier phase",
        (value) => {
          const network = (value.isolation as Record<string, unknown>)
            .network as Record<string, unknown>;
          network.verifierPhase = "allowlist";
        },
      ],
      [
        "unknown network field",
        (value) => {
          const network = (value.isolation as Record<string, unknown>)
            .network as Record<string, unknown>;
          network.unexpected = "no-network";
        },
      ],
    ];

    for (const [label, mutate] of mutations) {
      let calls = 0;
      const result = await judgeProjection({
        projectionRoot: projection,
        artifactPath: oracle,
        attestationPath: attestation(
          root,
          projection,
          oracle,
          "unmeasured",
          mutate,
        ),
        capabilityKey,
        transport: {
          async request() {
            calls += 1;
            throw new Error("provider must not run");
          },
        },
      });
      assert.equal(result.state, "verifier_failure", label);
      assert.equal(calls, 0, label);
    }
  });
});

test("does not execute a crafted Harbor verifier and rejects symlink ancestors", async () => {
  await withProjection(async (root, projection) => {
    const oracle = artifact(root, projection, "oracle");
    const marker = join(root, "host-execution-marker");
    writeFileSync(
      join(projection, "harbor", "tests", "test.sh"),
      `#!/bin/sh\ntouch ${marker}\n`,
      "utf8",
    );
    const result = await judgeProjection({
      projectionRoot: projection,
      artifactPath: oracle,
      attestationPath: attestation(root, projection, oracle),
      capabilityKey,
      transport: acceptedTransport([]),
    });
    assert.equal(result.state, "measured");
    assert.equal(existsSync(marker), false);

    const linkedParent = join(root, "linked-parent");
    symlinkSync(root, linkedParent);
    await assert.rejects(
      judgeProjection({
        projectionRoot: join(linkedParent, "projection"),
        artifactPath: oracle,
        attestationPath: attestation(root, projection, oracle),
        capabilityKey,
        transport: acceptedTransport([]),
      }),
      /symlinked path is not allowed/,
    );
  });
});

test("canonical QPCFR input is stable, mutation-sensitive, and excludes sealed judgment material", () => {
  const input: CanonicalJudgeInput = {
    identity: {
      release: "2026.8.12",
      trialId:
        "trial-9e05c89e6a757d7922506044444137300f0f8ac1f417bdce8d5e424fc86a4e58",
      caseId: "case-projection",
      condition: "T1-A",
      sourceDigest:
        "sha256:e1a989f57dfb509ab22c86b86e0ebbcb6595bd33f549e5401645f5c6adaf06a9",
    },
    candidate: {
      task: { instruction: "Choose", deliverable: "Respond" },
      evidence: [{ ref: "calendar", content: "source" }],
      perspective: { id: "perspective-a", content: "protect focus" },
      outputContract: { format: "json" },
      manifest: { decisions: [{ decisionId: "focus", selectedRegion: "x" }] },
      response: "candidate response",
    },
  };
  const baseline = buildCanonicalJudgePanelInput(input);
  assert.equal(
    buildCanonicalJudgePanelInput(structuredClone(input)).prompt,
    baseline.prompt,
  );
  for (const mutation of [
    {
      ...input,
      candidate: {
        ...input.candidate,
        task: { instruction: "Changed", deliverable: "Respond" },
      },
    },
    {
      ...input,
      candidate: {
        ...input.candidate,
        evidence: [{ ref: "calendar", content: "changed" }],
      },
    },
    { ...input, candidate: { ...input.candidate, perspective: null } },
    {
      ...input,
      candidate: { ...input.candidate, manifest: { decisions: [] } },
    },
    { ...input, candidate: { ...input.candidate, response: "changed" } },
  ]) {
    assert.notEqual(
      buildCanonicalJudgePanelInput(mutation).prompt,
      baseline.prompt,
    );
  }
  assert.equal(baseline.prompt.includes("acceptedRegions"), false);
  assert.equal(baseline.prompt.includes("Oracle"), false);
  assert.match(baseline.prompt, /pcda-qpcfr-2026\.8\.12/);
  assert.match(baseline.prompt, /remain task-grounded/);
});

test("panel disagreement and unavailable provider outcomes remain explicit non-measured states", async () => {
  await withProjection(async (root, projection) => {
    let calls = 0;
    const disagreement = await judgeProjection({
      projectionRoot: projection,
      artifactPath: artifact(root, projection, "oracle"),
      attestationPath: attestation(
        root,
        projection,
        artifact(root, projection, "oracle"),
      ),
      capabilityKey,
      transport: {
        async request(request) {
          calls += 1;
          return vote(request.model, {
            perspectiveAligned: request.model === "gpt-5.6-terra",
          });
        },
      },
    });
    assert.equal(disagreement.state, "judge_disagreement");
    assert.equal(calls, 2);

    const unavailable = await judgeProjection({
      projectionRoot: projection,
      artifactPath: artifact(root, projection, "oracle"),
      attestationPath: attestation(
        root,
        projection,
        artifact(root, projection, "oracle"),
      ),
      capabilityKey,
      transport: {
        async request() {
          return { state: "provider_error" as const };
        },
      },
    });
    assert.equal(unavailable.state, "judge_unavailable");
  });
});

test("MAC-authenticated attestation rejects forgery before any provider call and never persists secrets", async () => {
  await withProjection(async (root, projection) => {
    const oracle = artifact(root, projection, "oracle");
    const signed = attestation(root, projection, oracle);
    const forged = JSON.parse(readFileSync(signed, "utf8")) as Record<
      string,
      unknown
    >;
    forged.bankDigest =
      "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";
    writeFileSync(signed, JSON.stringify(forged), "utf8");

    let calls = 0;
    const result = await judgeProjection({
      projectionRoot: projection,
      artifactPath: oracle,
      attestationPath: signed,
      capabilityKey,
      transport: {
        async request() {
          calls += 1;
          throw new Error("provider must not run");
        },
      },
    });
    assert.equal(result.state, "verifier_failure");
    assert.equal(result.deterministic.reasonCode, "attestation_mac_invalid");
    assert.equal(calls, 0);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(capabilityKey), false);
    assert.equal(serialized.includes(String(forged.attestationMac)), false);
    assert.equal(serialized.includes("attestationMac"), false);

    const forgedNetworkPath = attestation(root, projection, oracle);
    const forgedNetwork = JSON.parse(
      readFileSync(forgedNetworkPath, "utf8"),
    ) as Record<string, unknown>;
    const network = (
      (forgedNetwork.isolation as Record<string, unknown>).network as Record<
        string,
        unknown
      >
    ).agent as Record<string, unknown>;
    network.hosts = ["api.openai.com", "example.com"];
    writeFileSync(forgedNetworkPath, JSON.stringify(forgedNetwork), "utf8");
    const networkForgery = await judgeProjection({
      projectionRoot: projection,
      artifactPath: oracle,
      attestationPath: forgedNetworkPath,
      capabilityKey,
      transport: acceptedTransport([]),
    });
    assert.equal(
      networkForgery.deterministic.reasonCode,
      "attestation_mac_invalid",
    );

    const missing = attestation(root, projection, oracle);
    const missingValue = JSON.parse(readFileSync(missing, "utf8")) as Record<
      string,
      unknown
    >;
    delete missingValue.attestationMac;
    writeFileSync(missing, JSON.stringify(missingValue), "utf8");
    const missingMac = await judgeProjection({
      projectionRoot: projection,
      artifactPath: oracle,
      attestationPath: missing,
      capabilityKey,
      transport: acceptedTransport([]),
    });
    assert.equal(
      missingMac.deterministic.reasonCode,
      "attestation_mac_invalid",
    );

    const invalidCapability = await judgeProjection({
      projectionRoot: projection,
      artifactPath: oracle,
      attestationPath: attestation(root, projection, oracle),
      capabilityKey: "not-a-32-byte-base64url-capability-key",
      transport: acceptedTransport([]),
    });
    assert.equal(
      invalidCapability.deterministic.reasonCode,
      "capability_key_invalid",
    );
  });
});

test("capability keys and attestation MACs use exact bounded encodings", () => {
  assert.match(capabilityKey, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(
    createAttestationMac(
      { benchCommit: "a".repeat(40), bankDigest: "sha256:a".padEnd(71, "a") },
      capabilityKey,
    ),
    createAttestationMac(
      { benchCommit: "b".repeat(40), bankDigest: "sha256:a".padEnd(71, "a") },
      capabilityKey,
    ),
  );
});

test("remaining judge cap stops before provider calls and preserves the configured remainder", async () => {
  await withProjection(async (root, projection) => {
    const oracle = artifact(root, projection, "oracle");
    let calls = 0;
    const result = await judgeProjection({
      projectionRoot: projection,
      artifactPath: oracle,
      attestationPath: attestation(root, projection, oracle),
      capabilityKey,
      judgeCampaignCapNanoUsd: 1,
      transport: {
        async request() {
          calls += 1;
          throw new Error("provider must not run");
        },
      },
    });
    assert.equal(calls, 0);
    assert.equal(result.state, "judge_unavailable");
    assert.equal(result.campaign?.state, "preflight_rejected");
    assert.equal(result.campaign?.remainingBudgetNanoUsd, 1);
    assert.equal(result.campaign?.budgetStopReason, "planned_cost_exceeds_cap");
  });
});

test("judge CLI consumes the remaining cap before provider setup and deletes it", async () => {
  await withProjection((root, projection) => {
    const oracle = artifact(root, projection, "oracle");
    const signed = attestation(root, projection, oracle);
    const cliPath = join(repositoryRoot, "src", "cli.ts");
    const cliArguments = ["judge", projection, oracle, signed];
    const probe = [
      `process.argv = [process.execPath, ${JSON.stringify(cliPath)}, ${cliArguments.map((argument) => JSON.stringify(argument)).join(", ")}];`,
      `await import(${JSON.stringify(pathToFileURL(cliPath).href)});`,
      "process.stdout.write(`${JSON.stringify({ cap: process.env.COFFEE_CHAT_EVAL_JUDGE_CAP_NANO_USD ?? null })}\\n`);",
    ].join("\n");
    const child = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "--eval", probe],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH ?? "",
          COFFEE_CHAT_EVAL_ATTESTATION_KEY: capabilityKey,
          COFFEE_CHAT_EVAL_JUDGE_CAP_NANO_USD: "1",
        },
      },
    );
    assert.equal(child.status, 1, child.stderr);
    const lines = child.stdout.trim().split("\n");
    const report = JSON.parse(lines.at(-2) ?? "") as Record<string, unknown>;
    const trace = JSON.parse(lines.at(-1) ?? "") as { cap: string | null };
    assert.equal(report.state, "judge_unavailable");
    assert.equal(
      (report.campaign as Record<string, unknown>).remainingBudgetNanoUsd,
      1,
    );
    assert.equal(trace.cap, null);
    assert.equal(child.stdout.includes("OPENAI_API_KEY"), false);
  });
});

test("CLI receives the capability only from Eval environment and preflights invalid attestations", async () => {
  await withProjection((root, projection) => {
    const oracle = artifact(root, projection, "oracle");
    const invalid = attestation(root, projection, oracle);
    const value = JSON.parse(readFileSync(invalid, "utf8")) as Record<
      string,
      unknown
    >;
    delete value.attestationMac;
    writeFileSync(invalid, JSON.stringify(value), "utf8");
    const cliPath = join(repositoryRoot, "src", "cli.ts");
    const cliArguments = ["judge", projection, oracle, invalid];
    assert.equal(cliArguments.includes(capabilityKey), false);
    const probe = [
      `process.argv = [process.execPath, ${JSON.stringify(cliPath)}, ${cliArguments.map((argument) => JSON.stringify(argument)).join(", ")}];`,
      `await import(${JSON.stringify(pathToFileURL(cliPath).href)});`,
      "process.stdout.write(`${JSON.stringify({ capability: process.env.COFFEE_CHAT_EVAL_ATTESTATION_KEY ?? null, argv: process.argv.slice(2) })}\\n`);",
    ].join("\n");
    const child = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "--eval", probe],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH ?? "",
          COFFEE_CHAT_EVAL_ATTESTATION_KEY: capabilityKey,
        },
      },
    );
    assert.equal(child.status, 1, child.stderr);
    const lines = child.stdout.trim().split("\n");
    const report = JSON.parse(lines.at(-2) ?? "") as Record<string, unknown>;
    const trace = JSON.parse(lines.at(-1) ?? "") as {
      capability: string | null;
      argv: string[];
    };
    assert.equal(report.state, "verifier_failure");
    assert.equal(child.stdout.includes("OPENAI_API_KEY"), false);
    assert.equal(child.stdout.includes(capabilityKey), false);
    assert.equal(JSON.stringify(report).includes(capabilityKey), false);
    assert.equal(trace.capability, null);
    assert.equal(trace.argv.includes(capabilityKey), false);

    const positional = spawnSync(
      process.execPath,
      ["--experimental-strip-types", cliPath, ...cliArguments, capabilityKey],
      {
        encoding: "utf8",
        env: {
          PATH: process.env.PATH ?? "",
          COFFEE_CHAT_EVAL_ATTESTATION_KEY: capabilityKey,
        },
      },
    );
    assert.equal(positional.status, 1, positional.stderr);
    const positionalReport = JSON.parse(positional.stdout) as Record<
      string,
      unknown
    >;
    assert.equal(positionalReport.state, "invalid");
    assert.equal(positional.stdout.includes(capabilityKey), false);
  });
});

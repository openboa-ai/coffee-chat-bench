import assert from "node:assert/strict";
import test from "node:test";

import { createOpenAiResponsesTransport } from "../src/openai-judge.ts";

test("Responses transport uses structured output and reads only OPENAI_API_KEY", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const transport = createOpenAiResponsesTransport(
    {
      OPENAI_API_KEY: "test-key",
      ANOTHER_KEY: "must-not-be-read",
    },
    async (url, init) => {
      request = { url: String(url), init };
      return new Response(
        JSON.stringify({
          model: "gpt-5.6-terra",
          output_text: JSON.stringify({
            taskAdequate: true,
            evidenceIntegrity: true,
            perspectiveAligned: true,
            invariantsPreserved: true,
            criticalFailure: false,
          }),
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
        { status: 200 },
      );
    },
  );
  const response = await transport.request({
    model: "gpt-5.6-terra",
    prompt: "private prompt",
    responseFormat: "judge-v1",
  });
  assert.equal(response.state, "response");
  assert.match(request?.url ?? "", /\/v1\/responses$/);
  const headers = new Headers(request?.init?.headers);
  assert.equal(headers.get("authorization"), "Bearer test-key");
  const body = JSON.parse(String(request?.init?.body)) as {
    text: { format: { type: string; strict: boolean } };
  };
  assert.deepEqual(body.text.format, {
    type: "json_schema",
    name: "judge_vote",
    strict: true,
    schema: {
      type: "object",
      properties: {
        taskAdequate: { type: "boolean" },
        evidenceIntegrity: { type: "boolean" },
        perspectiveAligned: { type: "boolean" },
        invariantsPreserved: { type: "boolean" },
        criticalFailure: { type: "boolean" },
      },
      required: [
        "taskAdequate",
        "evidenceIntegrity",
        "perspectiveAligned",
        "invariantsPreserved",
        "criticalFailure",
      ],
      additionalProperties: false,
    },
  });
  assert.equal(JSON.stringify(response).includes("test-key"), false);
  assert.equal(JSON.stringify(response).includes("private prompt"), false);
});

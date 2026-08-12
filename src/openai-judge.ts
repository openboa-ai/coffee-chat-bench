import type { JudgeModel } from "./judge-config.ts";

export type { JudgeModel } from "./judge-config.ts";

export interface JudgeRequest {
  model: JudgeModel;
  prompt: string;
  responseFormat: "judge-v1";
}

export interface JudgeUsage {
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  reasoningTokens?: number;
}

export type JudgeTransportResponse =
  | {
      state: "response";
      resolvedModel: string;
      body: unknown;
      usage?: unknown;
    }
  | { state: "provider_error" }
  | { state: "budget_stopped"; reason: "usage_invalid" };

export interface JudgeTransport {
  request(request: JudgeRequest): Promise<JudgeTransportResponse>;
  stopRequested?(): boolean;
  stopReason?(): "usage_invalid" | undefined;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const VOTE_SCHEMA = {
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
} as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function outputText(value: Record<string, unknown>): string | undefined {
  if (typeof value.output_text === "string") return value.output_text;
  if (!Array.isArray(value.output)) return undefined;
  for (const output of value.output) {
    const outputRecord = record(output);
    if (!outputRecord || !Array.isArray(outputRecord.content)) continue;
    for (const content of outputRecord.content) {
      const contentRecord = record(content);
      if (contentRecord && typeof contentRecord.text === "string") {
        return contentRecord.text;
      }
    }
  }
  return undefined;
}

function providerUsage(value: Record<string, unknown>): JudgeUsage | undefined {
  const usage = record(value.usage);
  if (!usage) return undefined;
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  if (typeof inputTokens !== "number" || typeof outputTokens !== "number") {
    return undefined;
  }
  const inputDetails = record(usage.input_tokens_details);
  const outputDetails = record(usage.output_tokens_details);
  const cachedInputTokens = inputDetails?.cached_tokens;
  const reasoningTokens = outputDetails?.reasoning_tokens;
  return {
    inputTokens,
    outputTokens,
    ...(typeof cachedInputTokens === "number" ? { cachedInputTokens } : {}),
    ...(typeof reasoningTokens === "number" ? { reasoningTokens } : {}),
  };
}

export function createOpenAiResponsesTransport(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  fetchLike: FetchLike = fetch,
): JudgeTransport {
  const apiKey = environment.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");
  return {
    async request(request) {
      let response: Response;
      try {
        response = await fetchLike("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: request.model,
            input: request.prompt,
            text: {
              format: {
                type: "json_schema",
                name: "judge_vote",
                strict: true,
                schema: VOTE_SCHEMA,
              },
            },
          }),
        });
      } catch {
        return { state: "provider_error" };
      }
      if (!response.ok) return { state: "provider_error" };
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return { state: "provider_error" };
      }
      const parsed = record(payload);
      if (!parsed || typeof parsed.model !== "string") {
        return { state: "provider_error" };
      }
      const text = outputText(parsed);
      let body: unknown = undefined;
      if (text !== undefined) {
        try {
          body = JSON.parse(text);
        } catch {
          body = { malformedStructuredOutput: true };
        }
      }
      return {
        state: "response",
        resolvedModel: parsed.model,
        body,
        ...(providerUsage(parsed) ? { usage: providerUsage(parsed) } : {}),
      };
    },
  };
}

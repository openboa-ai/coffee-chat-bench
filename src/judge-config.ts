import { readFileSync } from "node:fs";

import { Ajv2020 } from "ajv/dist/2020.js";

export type JudgeModel = string;

export interface JudgeTariff {
  inputUsd: number;
  outputUsd: number;
}

export interface JudgeCampaignConfig {
  role: "experimental_judge_configuration";
  calver: "2026.8.12";
  models: readonly [JudgeModel, JudgeModel];
  requestsPerModel: 1;
  responseFormat: "judge-v1";
  malformedRetries: 1;
  campaignCapNanoUsd: number;
  tariffSnapshot: {
    fetchedAt: string;
    sourceUrl: string;
    currency: "USD";
    unit: "per_1m_tokens";
    models: Record<JudgeModel, JudgeTariff>;
  };
}

const schema = JSON.parse(
  readFileSync(
    new URL("../schemas/judge-campaign.schema.json", import.meta.url),
    "utf8",
  ),
) as object;
const validate = new Ajv2020({ strict: true }).compile(schema);

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string")
    throw new TypeError(`${name} must be a string`);
  return value;
}

function number(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`);
  }
  return value;
}

export function parseJudgeCampaignConfig(value: unknown): JudgeCampaignConfig {
  if (!validate(value)) {
    throw new TypeError(
      `invalid judge campaign config: ${JSON.stringify(validate.errors)}`,
    );
  }
  const config = record(value, "judge campaign config");
  const models = config.models;
  if (!Array.isArray(models) || models.length !== 2) {
    throw new TypeError(
      "judge campaign config must contain exactly two models",
    );
  }
  const parsedModels = models.map((model, index) =>
    string(model, `models[${index}]`),
  );
  const tariffSnapshot = record(config.tariffSnapshot, "tariffSnapshot");
  const tariffModels = record(tariffSnapshot.models, "tariffSnapshot.models");
  const tariffs = Object.fromEntries(
    parsedModels.map((model) => {
      const tariff = record(
        tariffModels[model],
        `tariffSnapshot.models.${model}`,
      );
      return [
        model,
        {
          inputUsd: number(tariff.inputUsd, `${model}.inputUsd`),
          outputUsd: number(tariff.outputUsd, `${model}.outputUsd`),
        },
      ];
    }),
  ) as Record<JudgeModel, JudgeTariff>;
  return {
    role: string(config.role, "role") as JudgeCampaignConfig["role"],
    calver: string(config.calver, "calver") as JudgeCampaignConfig["calver"],
    models: [parsedModels[0] as JudgeModel, parsedModels[1] as JudgeModel],
    requestsPerModel: number(config.requestsPerModel, "requestsPerModel") as 1,
    responseFormat: string(
      config.responseFormat,
      "responseFormat",
    ) as JudgeCampaignConfig["responseFormat"],
    malformedRetries: number(config.malformedRetries, "malformedRetries") as 1,
    campaignCapNanoUsd: number(config.campaignCapNanoUsd, "campaignCapNanoUsd"),
    tariffSnapshot: {
      fetchedAt: string(tariffSnapshot.fetchedAt, "tariffSnapshot.fetchedAt"),
      sourceUrl: string(tariffSnapshot.sourceUrl, "tariffSnapshot.sourceUrl"),
      currency: string(
        tariffSnapshot.currency,
        "tariffSnapshot.currency",
      ) as "USD",
      unit: string(
        tariffSnapshot.unit,
        "tariffSnapshot.unit",
      ) as "per_1m_tokens",
      models: tariffs,
    },
  };
}

export function loadJudgeCampaignConfig(): JudgeCampaignConfig {
  return parseJudgeCampaignConfig(
    JSON.parse(
      readFileSync(
        new URL("../config/judges/2026.8.12.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}

export const DEFAULT_JUDGE_CAMPAIGN_CONFIG = loadJudgeCampaignConfig();

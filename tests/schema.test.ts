import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

import { rawCase } from "./fixtures.ts";

test("JSON schema agrees with the three-condition public case contract", async () => {
  const schema = JSON.parse(
    await readFile("schemas/benchmark.schema.json", "utf8"),
  ) as object;
  const validate = new (
    Ajv2020 as unknown as new (options: object) => {
      compile: (schema: object) => (value: unknown) => boolean;
    }
  )({ strict: false }).compile(schema);
  assert.equal(validate(await rawCase()), true);
  const invalid = await rawCase();
  (invalid.contexts as Record<string, unknown>).target_a = [];
  assert.equal(validate(invalid), false);
});

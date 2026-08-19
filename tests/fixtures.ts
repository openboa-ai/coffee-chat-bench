import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateBank, type ValidatedBankCase } from "../src/bank.ts";

export async function bankCase(
  caseId = "pair-01-missed-delivery-window",
): Promise<ValidatedBankCase> {
  const bank = await validateBank(resolve("bank"));
  const value = bank.cases.find(({ manifest }) => manifest.caseId === caseId);
  if (!value) throw new Error(`missing fixture case ${caseId}`);
  return value;
}

export async function rawCase(caseId = "pair-01-missed-delivery-window") {
  return JSON.parse(
    await readFile(resolve("bank/public/cases", `${caseId}.json`), "utf8"),
  ) as Record<string, unknown>;
}

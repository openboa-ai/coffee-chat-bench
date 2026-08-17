#!/usr/bin/env node

import { auditBank } from "../src/data-audit.ts";

try {
  const report = await auditBank(process.argv[2] ?? "bank");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "passed") process.exitCode = 1;
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}

import { resolve } from 'node:path';

import { generateReportSummary } from '../reports/report-summary.js';

async function main(): Promise<void> {
  const inputDir = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputDir) {
    throw new Error('Usage: npm run report-summary -- <traces-dir|run-dir> [summary.md]');
  }

  const summary = await generateReportSummary({
    inputDir: resolve(inputDir),
    outputPath: outputPath ? resolve(outputPath) : undefined,
  });

  console.log(JSON.stringify({
    reportSummaryPath: summary.outputPath,
    runs: summary.runs.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

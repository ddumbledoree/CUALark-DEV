import { stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { generateMarkdownReport } from '../reports/markdown-report.js';

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath) {
    throw new Error('Usage: npm run report -- <run-dir|steps.jsonl> [report.md]');
  }

  const runDir = await resolveRunDir(inputPath);
  const report = await generateMarkdownReport({
    runDir,
    outputPath: outputPath ? resolve(outputPath) : undefined,
  });

  console.log(JSON.stringify({ reportPath: report.outputPath }, null, 2));
}

async function resolveRunDir(inputPath: string): Promise<string> {
  const absolutePath = resolve(inputPath);
  const stats = await stat(absolutePath);
  if (stats.isDirectory()) {
    return absolutePath;
  }
  if (absolutePath.endsWith('steps.jsonl')) {
    return dirname(absolutePath);
  }
  throw new Error('Report input must be a run directory or a steps.jsonl file.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

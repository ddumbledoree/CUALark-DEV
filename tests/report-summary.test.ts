import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { generateReportSummary } from '../src/reports/report-summary.js';

const testRoot = await mkdtemp(join(tmpdir(), 'cua-lark-summary-'));

try {
  await writeRun('passed-run', {
    result: {
      taskId: 'passed-task',
      status: 'passed',
      operator: 'mock',
      tracePath: join(testRoot, 'passed-run', 'steps.jsonl'),
      startedAt: '2026-05-06T00:00:00.000Z',
      endedAt: '2026-05-06T00:00:01.000Z',
      observations: ['Step 1 executed finished with status=end'],
    },
    events: [
      { type: 'action.executed', step: 1, action: { type: 'finished' }, executeResult: { status: 'end' }, latencyMs: 100 },
    ],
  });
  await writeRun('blocked-run', {
    result: {
      taskId: 'blocked-task',
      status: 'blocked',
      operator: 'feishu-desktop',
      tracePath: join(testRoot, 'blocked-run', 'steps.jsonl'),
      startedAt: '2026-05-06T00:00:00.000Z',
      endedAt: '2026-05-06T00:00:02.000Z',
      observations: ['Run blocked: Unable to activate Feishu window by titles: Feishu'],
    },
    events: [
      { type: 'run.error', message: 'Unable to activate Feishu window by titles: Feishu' },
    ],
  });

  const summary = await generateReportSummary({ inputDir: testRoot });

  assert.equal(summary.runs.length, 2);
  assert.match(summary.markdown, /Runs: 2/);
  assert.match(summary.markdown, /Passed: 1/);
  assert.match(summary.markdown, /Blocked: 1/);
  assert.match(summary.markdown, /Success rate: 50\.0%/);
  assert.match(summary.markdown, /environment_focus: 1/);

  console.log('report summary smoke test passed');
} finally {
  await rm(testRoot, { recursive: true, force: true });
}

async function writeRun(
  name: string,
  input: {
    result: unknown;
    events: unknown[];
  },
): Promise<void> {
  const runDir = join(testRoot, name);
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'result.json'), `${JSON.stringify(input.result, null, 2)}\n`, 'utf-8');
  await writeFile(join(runDir, 'steps.jsonl'), `${input.events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf-8');
}

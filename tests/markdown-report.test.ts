import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { generateMarkdownReport } from '../src/reports/markdown-report.js';

const testRoot = await mkdtemp(join(tmpdir(), 'cua-lark-report-'));
const runDir = join(testRoot, 'sample-run');

try {
  await mkdir(join(runDir, 'screenshots'), { recursive: true });
  await writeFile(join(runDir, 'screenshots', '001.png'), '', 'utf-8');

  const task = {
    id: 'report-smoke',
    title: 'Report smoke',
    targetProduct: 'im',
    instruction: 'Open a test chat.',
    initialState: 'Feishu desktop test account is ready.',
    expectedResult: 'Target chat is visible.',
    safety: {
      allowedChats: ['CUA test chat'],
      allowedUsers: [],
      forbidDelete: true,
    },
    evaluator: {
      type: 'vlm_screenshot',
      question: 'Is the target chat visible?',
      expectedAnswer: 'passed',
    },
  };
  const result = {
    taskId: 'report-smoke',
    status: 'passed',
    operator: 'mock',
    tracePath: join(runDir, 'steps.jsonl'),
    startedAt: '2026-05-06T00:00:00.000Z',
    endedAt: '2026-05-06T00:00:02.500Z',
    observations: ['Loaded task report-smoke', 'Step 1 executed click with status=success'],
  };
  const events = [
    { type: 'task.loaded', task },
    { type: 'action.executed', step: 1, action: { type: 'click', x: 10, y: 20 }, executeResult: { status: 'success' }, latencyMs: 120 },
    { type: 'screenshot.captured', step: 1, path: join(runDir, 'screenshots', '001.png'), scaleFactor: 1.25, width: 100, height: 80 },
    { type: 'evaluator.vlm_screenshot', evaluation: { passed: true, reason: 'Target chat is visible.', latencyMs: 300, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } } },
    { type: 'run.result', result },
  ];

  await writeFile(join(runDir, 'steps.jsonl'), `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf-8');
  await writeFile(join(runDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf-8');

  const report = await generateMarkdownReport({ runDir });

  assert.equal(report.outputPath, join(runDir, 'report.md'));
  assert.match(report.markdown, /# CUA-Lark Run Report: report-smoke/);
  assert.match(report.markdown, /Success rate: 100%/);
  assert.match(report.markdown, /click\(10, 20\)/);
  assert.match(report.markdown, /Token usage: prompt=10, completion=5, total=15/);

  console.log('markdown report smoke test passed');
} finally {
  await rm(testRoot, { recursive: true, force: true });
}

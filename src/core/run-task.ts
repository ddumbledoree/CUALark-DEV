import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { CuaOperator } from '../operators/operator.js';
import type { TaskRunResult, TaskSpec } from './task-spec.js';

export interface RunTaskOptions {
  traceDir: string;
}

export async function runTask(
  task: TaskSpec,
  operator: CuaOperator,
  options: RunTaskOptions,
): Promise<TaskRunResult> {
  const startedAt = new Date().toISOString();
  const observations: string[] = [];

  observations.push(`Loaded task ${task.id}: ${task.title}`);
  observations.push(`Target product: ${task.targetProduct}`);

  const screenshot = await operator.screenshot();
  observations.push(`Initial screenshot captured with scaleFactor=${screenshot.scaleFactor}`);

  await operator.execute({
    type: 'note',
    note: 'Phase 1 mock execution only; desktop actions remain disabled in the app skeleton.',
  });

  const endedAt = new Date().toISOString();
  const tracePath = await writeTrace(task, {
    taskId: task.id,
    status: task.evaluator.type === 'mock' ? task.evaluator.expectedStatus : 'blocked',
    operator: operator.name,
    tracePath: '',
    startedAt,
    endedAt,
    observations,
  }, options.traceDir);

  return {
    taskId: task.id,
    status: task.evaluator.type === 'mock' ? task.evaluator.expectedStatus : 'blocked',
    operator: operator.name,
    tracePath,
    startedAt,
    endedAt,
    observations,
  };
}

async function writeTrace(
  task: TaskSpec,
  result: TaskRunResult,
  traceDir: string,
): Promise<string> {
  await mkdir(traceDir, { recursive: true });
  const tracePath = join(traceDir, `${task.id}-${Date.now()}.jsonl`);
  const events = [
    { type: 'task.loaded', task },
    { type: 'run.result', result: { ...result, tracePath } },
  ];

  await writeFile(tracePath, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf-8');
  return tracePath;
}

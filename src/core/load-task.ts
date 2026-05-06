import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { TaskSpec } from './task-spec.js';

export async function loadTaskSpec(taskPath: string): Promise<TaskSpec> {
  const absolutePath = resolve(process.cwd(), taskPath);
  const raw = await readFile(absolutePath, 'utf-8');
  const task = JSON.parse(raw) as TaskSpec;

  validateTaskSpec(task, taskPath);
  return task;
}

function validateTaskSpec(task: TaskSpec, taskPath: string): void {
  const required: Array<keyof TaskSpec> = [
    'id',
    'title',
    'targetProduct',
    'instruction',
    'initialState',
    'expectedResult',
    'safety',
    'evaluator',
  ];

  for (const field of required) {
    if (task[field] === undefined || task[field] === null || task[field] === '') {
      throw new Error(`TaskSpec ${taskPath} 缺少字段: ${field}`);
    }
  }

  if (!task.safety.forbidDelete) {
    throw new Error(`TaskSpec ${taskPath} 必须默认 forbidDelete=true`);
  }
}

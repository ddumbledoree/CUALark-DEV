import 'dotenv/config';

import { loadTaskSpec } from '../core/load-task.js';
import { runTask } from '../core/run-task.js';
import { createOperator } from '../operators/create-operator.js';

async function main(): Promise<void> {
  const taskPath = process.argv[2];
  if (!taskPath) {
    throw new Error('Usage: npm run run-task -- <task-spec.json>');
  }

  const operatorName = process.env.CUA_OPERATOR ?? 'mock';
  const traceDir = process.env.CUA_TRACE_DIR ?? 'traces';

  const task = await loadTaskSpec(taskPath);
  const operator = createOperator(operatorName);
  const result = await runTask(task, operator, { traceDir });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

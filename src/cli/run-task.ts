import 'dotenv/config';

import { loadTaskSpec } from '../core/load-task.js';
import { runTask } from '../core/run-task.js';
import { createLarkCliClientFromEnv } from '../evaluators/lark-cli-client.js';
import { createVlmProvider } from '../models/create-vlm-provider.js';
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
  const vlm = task.evaluator.type === 'vlm_screenshot' ? createVlmProvider() : undefined;
  const larkCli = task.evaluator.type === 'feishu_im_message_check'
    || task.evaluator.type === 'feishu_calendar_event_check'
    ? createLarkCliClientFromEnv()
    : undefined;
  const result = await runTask(task, operator, { traceDir, vlm, larkCli });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import 'dotenv/config';

import { loadTaskSpec } from '../core/load-task.js';
import { runAgentLoopV2 } from '../core/agent-loop-v2.js';
import { createLarkCliClientFromEnv } from '../evaluators/lark-cli-client.js';
import { createVlmProvider } from '../models/create-vlm-provider.js';
import { createOperator } from '../operators/create-operator.js';

async function main(): Promise<void> {
  const taskPath = process.argv[2];
  const instructionOverride = process.argv[3];
  if (!taskPath) {
    throw new Error('Usage: npm run agent-v2 -- <task-spec.json> [instruction]');
  }

  const operatorName = process.env.CUA_OPERATOR ?? 'mock';
  const traceDir = process.env.CUA_TRACE_DIR ?? 'traces';

  const task = await loadTaskSpec(taskPath);

  if (instructionOverride) {
    task.instruction = instructionOverride;
    console.log(`Instruction override: ${instructionOverride}`);
  }

  const operator = createOperator(operatorName);
  const vlm = createVlmProvider();

  const larkCli = task.evaluator.type === 'feishu_im_message_check'
    || task.evaluator.type === 'feishu_calendar_event_check'
    ? createLarkCliClientFromEnv()
    : undefined;

  const locatorMaxRetries = readNumberEnv('CUA_LOCATOR_MAX_RETRIES') ?? 2;
  const locatorConfidenceThreshold = readNumberEnv('CUA_LOCATOR_CONFIDENCE_THRESHOLD') ?? 0.5;

  const result = await runAgentLoopV2(task, operator, {
    traceDir,
    vlm,
    larkCli,
    locatorMaxRetries,
    locatorConfidenceThreshold,
    skipReset: (process.env.CUA_SKIP_RESET ?? '') === '1',
  });

  console.log(JSON.stringify(result, null, 2));
}

function readNumberEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number, got: ${raw}`);
  }
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import 'dotenv/config';

import { loadTaskSpec } from '../core/load-task.js';
import { runAgentLoop } from '../core/agent-loop.js';
import { createVlmProvider } from '../models/create-vlm-provider.js';
import { createOperator } from '../operators/create-operator.js';
import type { OperatorActionType } from '../operators/operator.js';

async function main(): Promise<void> {
  const taskPath = process.argv[2];
  if (!taskPath) {
    throw new Error('Usage: npm run agent-loop -- <task-spec.json>');
  }

  const task = await loadTaskSpec(taskPath);
  const operator = createOperator(process.env.CUA_OPERATOR ?? 'mock');
  const vlm = createVlmProvider();
  const traceDir = process.env.CUA_TRACE_DIR ?? 'traces';
  const maxSteps = readNumberEnv('CUA_AGENT_MAX_STEPS') ?? 3;
  const allowedActions = readAllowedActions(process.env.CUA_AGENT_ALLOWED_ACTIONS ?? 'wait,finished');

  const result = await runAgentLoop(task, operator, vlm, {
    traceDir,
    maxSteps,
    allowedActions,
  });

  console.log(JSON.stringify(result, null, 2));
}

function readNumberEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${raw}`);
  }

  return value;
}

function readAllowedActions(raw: string): OperatorActionType[] {
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!values.length) {
    throw new Error('CUA_AGENT_ALLOWED_ACTIONS must contain at least one action type.');
  }

  return values as OperatorActionType[];
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

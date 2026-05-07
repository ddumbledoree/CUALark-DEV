import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseVlmAction } from '../models/parse-vlm-action.js';
import type { VlmProvider, VlmResponse } from '../models/vlm-provider.js';
import type { CuaOperator, ExecuteResult, OperatorActionType, ScreenshotResult } from '../operators/operator.js';
import { checkActionSafety } from './action-safety.js';
import type { TaskRunResult, TaskSpec } from './task-spec.js';

export interface AgentLoopOptions {
  traceDir: string;
  maxSteps: number;
  allowedActions: OperatorActionType[];
}

export async function runAgentLoop(
  task: TaskSpec,
  operator: CuaOperator,
  vlm: VlmProvider,
  options: AgentLoopOptions,
): Promise<TaskRunResult> {
  const startedAt = new Date().toISOString();
  const observations: string[] = [];
  const runId = `${task.id}-agent-${Date.now()}`;
  const runDir = join(options.traceDir, runId);
  const screenshotDir = join(runDir, 'screenshots');
  const events: unknown[] = [
    {
      type: 'task.loaded',
      task,
    },
    {
      type: 'agent.config',
      operator: operator.name,
      vlmProvider: vlm.name,
      vlmModel: vlm.model,
      maxSteps: options.maxSteps,
      allowedActions: options.allowedActions,
    },
  ];

  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'task.json'), `${JSON.stringify(task, null, 2)}\n`, 'utf-8');

  let status: TaskRunResult['status'] = 'blocked';

  try {
    for (let step = 1; step <= options.maxSteps; step += 1) {
      const screenshot = await operator.screenshot();
      const screenshotPath = await writeScreenshot(screenshot, screenshotDir, step);
      events.push({
        type: 'screenshot.captured',
        step,
        path: screenshotPath,
        scaleFactor: screenshot.scaleFactor,
        width: screenshot.width,
        height: screenshot.height,
      });

      const vlmResponse = await askVlmForAction(task, vlm, screenshot, options, step);
      const parsedAction = parseVlmAction(vlmResponse.content).action;
      ensureAllowedAction(parsedAction.type, options.allowedActions);
      const safety = checkActionSafety(task, parsedAction);

      events.push({
        type: 'vlm.action',
        step,
        provider: vlm.name,
        model: vlmResponse.model,
        latencyMs: vlmResponse.latencyMs,
        usage: vlmResponse.usage,
        rawContent: vlmResponse.content,
        parsedAction,
        safety,
      });

      if (!safety.allowed) {
        throw new Error(`Action safety blocked ${parsedAction.type}: ${safety.reason}`);
      }

      const started = Date.now();
      const executeResult = await operator.execute(parsedAction);
      const latencyMs = Date.now() - started;
      events.push({
        type: 'action.executed',
        step,
        action: parsedAction,
        executeResult,
        latencyMs,
      });
      observations.push(
        `Step ${step}: VLM action=${parsedAction.type}, execute status=${executeResult.status}`,
      );

      if (executeResult.status === 'end' || parsedAction.type === 'finished') {
        status = 'passed';
        break;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    events.push({
      type: 'agent.error',
      message,
    });
    observations.push(`Agent loop blocked: ${message}`);
    status = 'blocked';
  }

  const endedAt = new Date().toISOString();
  const tracePath = await writeTrace(runDir, events, {
    taskId: task.id,
    status,
    operator: operator.name,
    tracePath: '',
    startedAt,
    endedAt,
    observations,
  });

  return {
    taskId: task.id,
    status,
    operator: operator.name,
    tracePath,
    startedAt,
    endedAt,
    observations,
  };
}

async function askVlmForAction(
  task: TaskSpec,
  vlm: VlmProvider,
  screenshot: ScreenshotResult,
  options: AgentLoopOptions,
  step: number,
): Promise<VlmResponse> {
  return vlm.complete({
    temperature: 0,
    image: {
      base64: screenshot.base64,
      mimeType: 'image/png',
    },
    messages: [
      {
        role: 'system',
        content: [
          '你是 CUA-Lark 的飞书桌面端 GUI 测试 Agent。',
          '当前阶段只允许输出一个 JSON object，不能输出 Markdown、解释或多余文本。',
          `允许动作类型只有：${options.allowedActions.join(', ')}。`,
          '动作 JSON schema：click 必须包含像素坐标，例如 {"type":"click","x":123,"y":456}；也可使用 {"type":"click","position":[123,456]}。',
          'type 动作格式为 {"type":"type","content":"CUA测试群"}，content 不得包含换行。',
          'hotkey 动作格式为 {"type":"hotkey","key":"ctrl+k"}，不得使用 Enter/Return/Delete/Backspace。',
          '安全规则：不得发送消息，不得删除、邀请、修改真实数据，不得输出带换行的 type 内容，不得使用 Enter/Return/Delete/Backspace 热键。',
          '如果需要搜索，只能输入安全白名单里的测试群名称；看到目标已出现或无法安全继续时输出 {"type":"finished"}。',
          'observe-only 或不确定阶段优先输出 {"type":"wait","waitMs":500}；如果你认为任务已经满足，则输出 {"type":"finished"}。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `任务 ID: ${task.id}`,
          `标题: ${task.title}`,
          `目标产品: ${task.targetProduct}`,
          `自然语言指令: ${task.instruction}`,
          `初始状态: ${task.initialState}`,
          `期望结果: ${task.expectedResult}`,
          `安全约束: forbidDelete=${task.safety.forbidDelete}`,
          `允许聊天白名单: ${(task.safety.allowedChats ?? []).join(', ') || '无'}`,
          `当前步数: ${step}/${options.maxSteps}`,
          '请根据截图输出下一步动作 JSON。',
        ].join('\n'),
      },
    ],
  });
}

function ensureAllowedAction(type: OperatorActionType, allowedActions: OperatorActionType[]): void {
  if (!allowedActions.includes(type)) {
    throw new Error(`VLM action ${type} is not allowed in current agent loop.`);
  }
}

async function writeScreenshot(
  screenshot: ScreenshotResult,
  screenshotDir: string,
  step: number,
): Promise<string> {
  await mkdir(screenshotDir, { recursive: true });
  const screenshotPath = join(screenshotDir, `${String(step).padStart(3, '0')}.png`);
  await writeFile(screenshotPath, Buffer.from(screenshot.base64, 'base64'));
  return screenshotPath;
}

async function writeTrace(
  runDir: string,
  events: unknown[],
  result: TaskRunResult,
): Promise<string> {
  await mkdir(runDir, { recursive: true });
  const tracePath = join(runDir, 'steps.jsonl');
  const resultWithTrace = { ...result, tracePath };
  await writeFile(
    tracePath,
    `${[...events, { type: 'run.result', result: resultWithTrace }]
      .map((event) => JSON.stringify(event))
      .join('\n')}\n`,
    'utf-8',
  );
  await writeFile(join(runDir, 'result.json'), `${JSON.stringify(resultWithTrace, null, 2)}\n`, 'utf-8');
  return tracePath;
}

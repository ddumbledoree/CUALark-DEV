import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { evaluateCalendarEventWithLarkCli, type FeishuCalendarEventEvaluation } from '../evaluators/calendar-event-evaluator.js';
import { evaluateImMessageWithLarkCli, type FeishuImMessageEvaluation } from '../evaluators/im-message-evaluator.js';
import type { LarkCliClient } from '../evaluators/lark-cli-client.js';
import { evaluateScreenshotWithVlm, type VlmScreenshotEvaluation } from '../evaluators/vlm-screenshot-evaluator.js';
import type { VlmProvider } from '../models/vlm-provider.js';
import type { ExecuteResult, OperatorAction, ScreenshotResult } from '../operators/operator.js';
import type { CuaOperator } from '../operators/operator.js';
import { checkActionSafety } from './action-safety.js';
import type { TaskRunResult, TaskSpec } from './task-spec.js';

export interface RunTaskOptions {
  traceDir: string;
  vlm?: VlmProvider;
  larkCli?: LarkCliClient;
}

export async function runTask(
  task: TaskSpec,
  operator: CuaOperator,
  options: RunTaskOptions,
): Promise<TaskRunResult> {
  const startedAt = new Date().toISOString();
  const observations: string[] = [];
  const runId = `${task.id}-${Date.now()}`;
  const runDir = join(options.traceDir, runId);
  const screenshotDir = join(runDir, 'screenshots');
  const events: unknown[] = [{ type: 'task.loaded', task }];
  let lastScreenshot: ScreenshotResult | undefined;
  let evaluation: VlmScreenshotEvaluation | undefined;
  let imMessageEvaluation: FeishuImMessageEvaluation | undefined;
  let calendarEventEvaluation: FeishuCalendarEventEvaluation | undefined;
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'task.json'), `${JSON.stringify(task, null, 2)}\n`, 'utf-8');

  observations.push(`Loaded task ${task.id}: ${task.title}`);
  observations.push(`Target product: ${task.targetProduct}`);

  let finalExecuteResult: ExecuteResult | undefined;
  let status: TaskRunResult['status'] = 'blocked';

  try {
    const screenshot = await operator.screenshot();
    lastScreenshot = screenshot;
    const initialScreenshotPath = await writeScreenshot(screenshot, screenshotDir, 0);
    events.push({
      type: 'screenshot.captured',
      step: 0,
      path: initialScreenshotPath,
      scaleFactor: screenshot.scaleFactor,
      width: screenshot.width,
      height: screenshot.height,
    });
    observations.push(
      `Initial screenshot captured with scaleFactor=${screenshot.scaleFactor}, path=${initialScreenshotPath}`,
    );

    const actions = getActions(task);

    for (let index = 0; index < actions.length; index += 1) {
      const step = index + 1;
      const action = actions[index];
      const safety = checkActionSafety(task, action);
      events.push({
        type: 'action.safety',
        step,
        action,
        safety,
      });
      if (!safety.allowed) {
        throw new Error(`Action safety blocked ${action.type}: ${safety.reason}`);
      }

      const started = Date.now();
      const executeResult = await operator.execute(action);
      finalExecuteResult = executeResult;
      const latencyMs = Date.now() - started;

      events.push({
        type: 'action.executed',
        step,
        action,
        executeResult,
        latencyMs,
      });
      observations.push(
        `Step ${step} executed ${action.type} with status=${executeResult.status}, latencyMs=${latencyMs}`,
      );

      const after = await operator.screenshot();
      lastScreenshot = after;
      const afterPath = await writeScreenshot(after, screenshotDir, step);
      events.push({
        type: 'screenshot.captured',
        step,
        path: afterPath,
        scaleFactor: after.scaleFactor,
        width: after.width,
        height: after.height,
      });

      if (executeResult.status === 'end') {
        break;
      }
    }
    if (task.evaluator.type === 'vlm_screenshot') {
      if (!options.vlm) {
        throw new Error('VLM provider is required for vlm_screenshot evaluator.');
      }
      if (!lastScreenshot) {
        throw new Error('No screenshot available for vlm_screenshot evaluator.');
      }

      evaluation = await evaluateScreenshotWithVlm(task, lastScreenshot, options.vlm);
      events.push({
        type: 'evaluator.vlm_screenshot',
        evaluation,
      });
    }
    if (task.evaluator.type === 'feishu_im_message_check') {
      if (!options.larkCli) {
        throw new Error('lark-cli client is required for feishu_im_message_check evaluator.');
      }
      imMessageEvaluation = await evaluateImMessageWithLarkCli(task, options.larkCli);
      events.push({
        type: 'evaluator.feishu_im_message_check',
        evaluation: imMessageEvaluation,
      });
    }
    if (task.evaluator.type === 'feishu_calendar_event_check') {
      if (!options.larkCli) {
        throw new Error('lark-cli client is required for feishu_calendar_event_check evaluator.');
      }
      calendarEventEvaluation = await evaluateCalendarEventWithLarkCli(task, options.larkCli);
      events.push({
        type: 'evaluator.feishu_calendar_event_check',
        evaluation: calendarEventEvaluation,
      });
    }
    status = resolveStatus(task, finalExecuteResult, evaluation, imMessageEvaluation, calendarEventEvaluation);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    events.push({
      type: 'run.error',
      message,
    });
    observations.push(`Run blocked: ${message}`);
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

function getActions(task: TaskSpec): OperatorAction[] {
  if (task.actions?.length) {
    return task.actions;
  }

  return [
    {
      type: 'note',
      note: 'No scripted desktop actions are defined for this TaskSpec yet.',
    },
  ];
}

function resolveStatus(
  task: TaskSpec,
  executeResult?: ExecuteResult,
  evaluation?: VlmScreenshotEvaluation,
  imMessageEvaluation?: FeishuImMessageEvaluation,
  calendarEventEvaluation?: FeishuCalendarEventEvaluation,
): TaskRunResult['status'] {
  if (task.evaluator.type === 'mock') {
    return task.evaluator.expectedStatus;
  }

  if (task.evaluator.type === 'vlm_screenshot') {
    return evaluation?.passed ? 'passed' : 'failed';
  }

  if (task.evaluator.type === 'feishu_im_message_check') {
    return imMessageEvaluation?.passed ? 'passed' : 'failed';
  }

  if (task.evaluator.type === 'feishu_calendar_event_check') {
    return calendarEventEvaluation?.passed ? 'passed' : 'failed';
  }

  if (executeResult?.status === 'end') {
    return 'passed';
  }

  return 'blocked';
}

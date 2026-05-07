import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';

import type { OperatorAction } from '../operators/operator.js';
import type { TaskRunResult, TaskSpec } from '../core/task-spec.js';

interface TraceEventBase {
  type: string;
  step?: number;
}

interface TaskLoadedEvent extends TraceEventBase {
  type: 'task.loaded';
  task: TaskSpec;
}

interface ScreenshotCapturedEvent extends TraceEventBase {
  type: 'screenshot.captured';
  step: number;
  path: string;
  scaleFactor?: number;
  width?: number;
  height?: number;
}

interface ActionExecutedEvent extends TraceEventBase {
  type: 'action.executed';
  step: number;
  action: OperatorAction;
  executeResult?: {
    status?: string;
    message?: string;
  };
  latencyMs?: number;
}

interface EvaluatorEvent extends TraceEventBase {
  type: 'evaluator.vlm_screenshot';
  evaluation: {
    passed: boolean;
    reason?: string;
    rawContent?: string;
    latencyMs?: number;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  };
}

interface FeishuImEvaluatorEvent extends TraceEventBase {
  type: 'evaluator.feishu_im_message_check';
  evaluation: {
    passed: boolean;
    reason: string;
    attempts: number;
    latencyMs: number;
    larkCliArgs: string[];
    evidence?: {
      expectedText: string;
      matchedText: string;
      chatId?: string;
      chatName?: string;
    };
  };
}

interface FeishuCalendarEvaluatorEvent extends TraceEventBase {
  type: 'evaluator.feishu_calendar_event_check';
  evaluation: {
    passed: boolean;
    reason: string;
    attempts: number;
    latencyMs: number;
    larkCliArgs: string[];
    evidence?: {
      expectedTitle: string;
      matchedTitle: string;
      calendarId?: string;
      calendarName?: string;
      expectedStartText?: string;
      expectedEndText?: string;
      expectedAttendee?: string;
    };
  };
}

interface RunErrorEvent extends TraceEventBase {
  type: 'run.error';
  message: string;
}

interface LocatorVlmEvent extends TraceEventBase {
  type: 'locator.vlm';
  step: number;
  description?: string;
  result: {
    found: boolean;
    x: number;
    y: number;
    confidence: number;
    reason: string;
    source: 'vlm' | 'calibrated_fallback';
  };
  attempt?: number;
}

interface LocatorFallbackEvent extends TraceEventBase {
  type: 'locator.fallback';
  step: number;
  reason?: string;
}

interface RunResultEvent extends TraceEventBase {
  type: 'run.result';
  result: TaskRunResult;
}

type TraceEvent =
  | TaskLoadedEvent
  | ScreenshotCapturedEvent
  | ActionExecutedEvent
  | EvaluatorEvent
  | FeishuImEvaluatorEvent
  | FeishuCalendarEvaluatorEvent
  | LocatorVlmEvent
  | LocatorFallbackEvent
  | RunErrorEvent
  | RunResultEvent
  | TraceEventBase;

export interface GenerateMarkdownReportOptions {
  runDir: string;
  outputPath?: string;
}

export interface GeneratedMarkdownReport {
  outputPath: string;
  markdown: string;
}

export async function generateMarkdownReport(
  options: GenerateMarkdownReportOptions,
): Promise<GeneratedMarkdownReport> {
  const runDir = normalize(options.runDir);
  const tracePath = join(runDir, 'steps.jsonl');
  const resultPath = join(runDir, 'result.json');
  const [traceText, resultText] = await Promise.all([
    readFile(tracePath, 'utf-8'),
    readFile(resultPath, 'utf-8'),
  ]);
  const events = parseTraceEvents(traceText);
  const result = JSON.parse(resultText) as TaskRunResult;
  const markdown = buildMarkdownReport(runDir, events, result);
  const outputPath = options.outputPath ? normalize(options.outputPath) : join(runDir, 'report.md');

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf-8');

  return { outputPath, markdown };
}

export function buildMarkdownReport(
  runDir: string,
  events: TraceEvent[],
  result: TaskRunResult,
): string {
  const task = findEvent<TaskLoadedEvent>(events, 'task.loaded')?.task;
  const actions = events.filter(isActionExecutedEvent);
  const screenshots = events.filter(isScreenshotCapturedEvent);
  const evaluator = findEvent<EvaluatorEvent>(events, 'evaluator.vlm_screenshot')?.evaluation;
  const imEvaluator = findEvent<FeishuImEvaluatorEvent>(events, 'evaluator.feishu_im_message_check')?.evaluation;
  const calendarEvaluator = findEvent<FeishuCalendarEvaluatorEvent>(
    events,
    'evaluator.feishu_calendar_event_check',
  )?.evaluation;
  const runError = findEvent<RunErrorEvent>(events, 'run.error')?.message;
  const durationMs = dateDiffMs(result.startedAt, result.endedAt);
  const successRate = result.status === 'passed' ? '100%' : '0%';
  const failureReason = result.status === 'passed'
    ? 'N/A'
    : runError ?? evaluator?.reason ?? imEvaluator?.reason ?? calendarEvaluator?.reason ?? 'No explicit failure reason recorded.';

  // 汇总 Phase 3 所需的可复盘指标，避免只看截图主观判断。
  const lines = [
    `# CUA-Lark Run Report: ${result.taskId}`,
    '',
    '## Summary',
    '',
    `- Status: ${result.status}`,
    `- Success rate: ${successRate}`,
    `- Operator: ${result.operator}`,
    `- Target product: ${task?.targetProduct ?? 'unknown'}`,
    `- Duration: ${formatDuration(durationMs)}`,
    `- Steps: ${actions.length}`,
    `- Failure reason: ${failureReason}`,
    '',
  ];

  if (task) {
    lines.push(
      '## Task',
      '',
      `- Title: ${task.title}`,
      `- Instruction: ${task.instruction}`,
      `- Initial state: ${task.initialState}`,
      `- Expected result: ${task.expectedResult}`,
      `- Evaluator: ${task.evaluator.type}`,
      '',
    );
  }

  lines.push('## Actions', '', '| Step | Action | Status | Latency | Screenshot |', '|---:|---|---|---:|---|');
  for (const action of actions) {
    const screenshot = screenshots.find((item) => item.step === action.step);
    lines.push(
      `| ${action.step} | ${escapeTableCell(formatAction(action.action))} | ${action.executeResult?.status ?? 'unknown'} | ${action.latencyMs ?? 0}ms | ${escapeTableCell(formatScreenshot(runDir, screenshot))} |`,
    );
  }
  if (actions.length === 0) {
    lines.push('| - | No action events recorded | - | - | - |');
  }
  lines.push('');

  // Locator section
  const locatorEvents = events.filter(isLocatorVlmEvent);
  const fallbackEvents = events.filter(isLocatorFallbackEvent);
  if (locatorEvents.length > 0 || fallbackEvents.length > 0) {
    lines.push('## Locator', '');
    lines.push('| Step | Source | Confidence | Coordinates | Reason |');
    lines.push('|---:|---|---:|---|---|');
    for (const locEvent of locatorEvents) {
      const source = locEvent.result.source === 'vlm' ? 'VLM' : 'fallback';
      const coords = locEvent.result.found ? `(${locEvent.result.x}, ${locEvent.result.y})` : '-';
      const confidence = locEvent.result.found ? locEvent.result.confidence.toFixed(2) : '-';
      lines.push(
        `| ${locEvent.step} | ${source} | ${confidence} | ${coords} | ${escapeTableCell(locEvent.result.reason)} |`,
      );
    }
    for (const fbEvent of fallbackEvents) {
      lines.push(
        `| ${fbEvent.step} | fallback | - | - | ${escapeTableCell(fbEvent.reason ?? 'VLM 定位失败，使用校准坐标')} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Evaluator', '');
  if (evaluator) {
    lines.push(
      `- Type: vlm_screenshot`,
      `- Passed: ${evaluator.passed}`,
      `- Reason: ${evaluator.reason ?? 'N/A'}`,
      `- Latency: ${evaluator.latencyMs ?? 0}ms`,
      `- Token usage: prompt=${evaluator.usage?.promptTokens ?? 0}, completion=${evaluator.usage?.completionTokens ?? 0}, total=${evaluator.usage?.totalTokens ?? 0}`,
      '',
    );
  } else if (imEvaluator) {
    lines.push(
      `- Type: feishu_im_message_check`,
      `- Passed: ${imEvaluator.passed}`,
      `- Reason: ${imEvaluator.reason}`,
      `- Attempts: ${imEvaluator.attempts}`,
      `- Latency: ${imEvaluator.latencyMs}ms`,
      `- lark-cli args: ${imEvaluator.larkCliArgs.join(' ')}`,
      `- Evidence: ${formatImEvaluatorEvidence(imEvaluator.evidence)}`,
      '',
    );
  } else if (calendarEvaluator) {
    lines.push(
      `- Type: feishu_calendar_event_check`,
      `- Passed: ${calendarEvaluator.passed}`,
      `- Reason: ${calendarEvaluator.reason}`,
      `- Attempts: ${calendarEvaluator.attempts}`,
      `- Latency: ${calendarEvaluator.latencyMs}ms`,
      `- lark-cli args: ${calendarEvaluator.larkCliArgs.join(' ')}`,
      `- Evidence: ${formatCalendarEvaluatorEvidence(calendarEvaluator.evidence)}`,
      '',
    );
  } else {
    lines.push('- No evaluator event recorded.', '');
  }

  lines.push('## Screenshots', '');
  for (const screenshot of screenshots) {
    lines.push(
      `- Step ${screenshot.step}: ${formatScreenshot(runDir, screenshot)} (${screenshot.width ?? '?'}x${screenshot.height ?? '?'}, scaleFactor=${screenshot.scaleFactor ?? '?'})`,
    );
  }
  if (screenshots.length === 0) {
    lines.push('- No screenshots recorded.');
  }
  lines.push('');

  lines.push('## Observations', '');
  for (const observation of result.observations) {
    lines.push(`- ${observation}`);
  }
  if (result.observations.length === 0) {
    lines.push('- No observations recorded.');
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function formatCalendarEvaluatorEvidence(evidence: FeishuCalendarEvaluatorEvent['evaluation']['evidence']): string {
  if (!evidence) {
    return 'N/A';
  }
  const target = evidence.calendarId ?? evidence.calendarName ?? 'unknown calendar';
  const fields = [
    `expectedTitle="${evidence.expectedTitle}"`,
    `matchedTitle="${evidence.matchedTitle}"`,
    `target=${target}`,
  ];
  if (evidence.expectedStartText) {
    fields.push(`start="${evidence.expectedStartText}"`);
  }
  if (evidence.expectedEndText) {
    fields.push(`end="${evidence.expectedEndText}"`);
  }
  if (evidence.expectedAttendee) {
    fields.push(`attendee="${evidence.expectedAttendee}"`);
  }
  return fields.join(', ');
}

function formatImEvaluatorEvidence(evidence: FeishuImEvaluatorEvent['evaluation']['evidence']): string {
  if (!evidence) {
    return 'N/A';
  }
  const target = evidence.chatId ?? evidence.chatName ?? 'unknown target';
  return `expected="${evidence.expectedText}", matched="${evidence.matchedText}", target=${target}`;
}

function parseTraceEvents(traceText: string): TraceEvent[] {
  return traceText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TraceEvent);
}

function findEvent<T extends TraceEvent>(events: TraceEvent[], type: T['type']): T | undefined {
  return events.find((event): event is T => event.type === type);
}

function isActionExecutedEvent(event: TraceEvent): event is ActionExecutedEvent {
  return event.type === 'action.executed';
}

function isScreenshotCapturedEvent(event: TraceEvent): event is ScreenshotCapturedEvent {
  return event.type === 'screenshot.captured';
}

function isLocatorVlmEvent(event: TraceEvent): event is LocatorVlmEvent {
  return event.type === 'locator.vlm';
}

function isLocatorFallbackEvent(event: TraceEvent): event is LocatorFallbackEvent {
  return event.type === 'locator.fallback';
}

function formatAction(action: OperatorAction): string {
  if (action.type === 'click' || action.type === 'double_click' || action.type === 'right_click') {
    return `${action.type}(${action.x}, ${action.y})`;
  }
  if (action.type === 'type') {
    return `type("${action.content ?? ''}")`;
  }
  if (action.type === 'hotkey') {
    return `hotkey(${action.key ?? ''})`;
  }
  if (action.type === 'scroll') {
    return `scroll(${action.direction ?? 'down'})`;
  }
  if (action.type === 'wait') {
    return `wait(${action.waitMs ?? 0}ms)`;
  }
  return action.type;
}

function formatScreenshot(runDir: string, screenshot?: ScreenshotCapturedEvent): string {
  if (!screenshot) {
    return '-';
  }
  return normalize(screenshot.path).startsWith(normalize(runDir))
    ? screenshot.path
    : screenshot.path;
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function dateDiffMs(startedAt: string, endedAt: string): number {
  const diff = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(diff) && diff >= 0 ? diff : 0;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
}

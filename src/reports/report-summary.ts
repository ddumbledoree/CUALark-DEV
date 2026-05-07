import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';

import type { TaskRunResult } from '../core/task-spec.js';

interface TraceEventBase {
  type: string;
  step?: number;
}

interface ActionExecutedEvent extends TraceEventBase {
  type: 'action.executed';
  latencyMs?: number;
}

interface EvaluatorEvent extends TraceEventBase {
  type: 'evaluator.vlm_screenshot';
  evaluation: {
    passed: boolean;
    reason?: string;
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
    latencyMs: number;
  };
}

interface FeishuCalendarEvaluatorEvent extends TraceEventBase {
  type: 'evaluator.feishu_calendar_event_check';
  evaluation: {
    passed: boolean;
    reason: string;
    latencyMs: number;
  };
}

interface RunErrorEvent extends TraceEventBase {
  type: 'run.error';
  message: string;
}

interface SafetyEvent extends TraceEventBase {
  type: 'action.safety' | 'vlm.action';
  safety?: {
    allowed: boolean;
    reason?: string;
  };
}

type TraceEvent =
  | ActionExecutedEvent
  | EvaluatorEvent
  | FeishuImEvaluatorEvent
  | FeishuCalendarEvaluatorEvent
  | RunErrorEvent
  | SafetyEvent
  | TraceEventBase;

interface RunSummary {
  runDir: string;
  runName: string;
  taskId: string;
  status: TaskRunResult['status'];
  operator: string;
  durationMs: number;
  stepCount: number;
  evaluatorPassed?: boolean;
  evaluatorReason?: string;
  tokenTotal: number;
  failureCategory: string;
  failureReason: string;
  reportPath?: string;
}

export interface GenerateReportSummaryOptions {
  inputDir: string;
  outputPath?: string;
}

export interface GeneratedReportSummary {
  outputPath: string;
  markdown: string;
  runs: RunSummary[];
}

export async function generateReportSummary(
  options: GenerateReportSummaryOptions,
): Promise<GeneratedReportSummary> {
  const inputDir = normalize(options.inputDir);
  const runDirs = await findRunDirs(inputDir);
  const runs = await Promise.all(runDirs.map(readRunSummary));
  runs.sort((left, right) => left.runName.localeCompare(right.runName));

  const markdown = buildReportSummaryMarkdown(inputDir, runs);
  const outputPath = normalize(options.outputPath ?? join(inputDir, 'report-summary.md'));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf-8');

  return { outputPath, markdown, runs };
}

export function buildReportSummaryMarkdown(inputDir: string, runs: RunSummary[]): string {
  const counts = countByStatus(runs);
  const failedRuns = runs.filter((run) => run.status !== 'passed');
  const avgSteps = average(runs.map((run) => run.stepCount));
  const avgDuration = average(runs.map((run) => run.durationMs));
  const successRate = runs.length === 0 ? 0 : (counts.passed / runs.length) * 100;
  const reasonCounts = countBy(failedRuns, (run) => run.failureCategory);

  // 汇总多个 run，显式纳入 blocked/failed，避免只展示验收成功样本。
  const lines = [
    '# CUA-Lark Report Summary',
    '',
    '## Scope',
    '',
    `- Input: ${inputDir}`,
    `- Runs: ${runs.length}`,
    '',
    '## Metrics',
    '',
    `- Passed: ${counts.passed}`,
    `- Failed: ${counts.failed}`,
    `- Blocked: ${counts.blocked}`,
    `- Success rate: ${successRate.toFixed(1)}%`,
    `- Average steps: ${avgSteps.toFixed(1)}`,
    `- Average duration: ${formatDuration(avgDuration)}`,
    '',
    '## Failure Categories',
    '',
  ];

  if (failedRuns.length === 0) {
    lines.push('- No failed or blocked runs found.', '');
  } else {
    for (const [category, count] of Object.entries(reasonCounts).sort()) {
      lines.push(`- ${category}: ${count}`);
    }
    lines.push('');
  }

  lines.push(
    '## Runs',
    '',
    '| Run | Task | Status | Operator | Steps | Duration | Failure category | Failure reason | Report |',
    '|---|---|---|---|---:|---:|---|---|---|',
  );
  for (const run of runs) {
    lines.push(
      `| ${escapeTableCell(run.runName)} | ${escapeTableCell(run.taskId)} | ${run.status} | ${run.operator} | ${run.stepCount} | ${formatDuration(run.durationMs)} | ${escapeTableCell(run.failureCategory)} | ${escapeTableCell(run.failureReason)} | ${escapeTableCell(run.reportPath ?? '-')} |`,
    );
  }
  if (runs.length === 0) {
    lines.push('| - | - | - | - | - | - | - | No run directories found | - |');
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function findRunDirs(inputDir: string): Promise<string[]> {
  if (await isRunDir(inputDir)) {
    return [inputDir];
  }

  const entries = await readdir(inputDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(inputDir, entry.name));
  const checks = await Promise.all(candidates.map(async (candidate) => ({
    candidate,
    isRun: await isRunDir(candidate),
  })));
  return checks.filter((check) => check.isRun).map((check) => check.candidate);
}

async function isRunDir(candidate: string): Promise<boolean> {
  try {
    const [resultStats, traceStats] = await Promise.all([
      stat(join(candidate, 'result.json')),
      stat(join(candidate, 'steps.jsonl')),
    ]);
    return resultStats.isFile() && traceStats.isFile();
  } catch {
    return false;
  }
}

async function readRunSummary(runDir: string): Promise<RunSummary> {
  const [resultText, traceText] = await Promise.all([
    readFile(join(runDir, 'result.json'), 'utf-8'),
    readFile(join(runDir, 'steps.jsonl'), 'utf-8'),
  ]);
  const result = JSON.parse(resultText) as TaskRunResult;
  const events = parseTraceEvents(traceText);
  const actions = events.filter(isActionExecutedEvent);
  const evaluator = events.find(isEvaluatorEvent)?.evaluation;
  const imEvaluator = events.find(isFeishuImEvaluatorEvent)?.evaluation;
  const calendarEvaluator = events.find(isFeishuCalendarEvaluatorEvent)?.evaluation;
  const runError = events.find(isRunErrorEvent)?.message;
  const safetyBlock = events.find(isSafetyBlockEvent);
  const durationMs = dateDiffMs(result.startedAt, result.endedAt);
  const reportPath = await optionalReportPath(runDir);
  const failure = classifyFailure(result, events, runError, safetyBlock, evaluator, imEvaluator, calendarEvaluator);

  return {
    runDir,
    runName: runDir.split(/[\\/]/).at(-1) ?? runDir,
    taskId: result.taskId,
    status: result.status,
    operator: result.operator,
    durationMs,
    stepCount: actions.length,
    evaluatorPassed: evaluator?.passed ?? imEvaluator?.passed ?? calendarEvaluator?.passed,
    evaluatorReason: evaluator?.reason ?? imEvaluator?.reason ?? calendarEvaluator?.reason,
    tokenTotal: evaluator?.usage?.totalTokens ?? 0,
    failureCategory: failure.category,
    failureReason: failure.reason,
    reportPath,
  };
}

function parseTraceEvents(traceText: string): TraceEvent[] {
  return traceText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as TraceEvent);
}

function classifyFailure(
  result: TaskRunResult,
  events: TraceEvent[],
  runError?: string,
  safetyBlock?: SafetyEvent,
  evaluator?: EvaluatorEvent['evaluation'],
  imEvaluator?: FeishuImEvaluatorEvent['evaluation'],
  calendarEvaluator?: FeishuCalendarEvaluatorEvent['evaluation'],
): { category: string; reason: string } {
  if (result.status === 'passed') {
    return { category: 'passed', reason: 'N/A' };
  }
  if (safetyBlock?.safety?.reason) {
    return { category: 'safety_blocked', reason: safetyBlock.safety.reason };
  }

  // Check for locator-related failures
  const locatorFallbacks = events.filter((e) => e.type === 'locator.fallback');
  const locatorRetries = events.filter((e) => e.type === 'locator.retry');
  if (locatorFallbacks.length > 0) {
    return {
      category: 'locator_fallback',
      reason: `VLM locator triggered fallback ${locatorFallbacks.length} time(s)`,
    };
  }
  if (locatorRetries.length > 2) {
    return {
      category: 'locator_unstable',
      reason: `VLM locator required ${locatorRetries.length} retries`,
    };
  }

  if (runError) {
    if (runError.includes('Unable to activate Feishu window')) {
      return { category: 'environment_focus', reason: runError };
    }
    return { category: 'run_error', reason: runError };
  }
  if (evaluator && !evaluator.passed) {
    return {
      category: 'evaluator_failed',
      reason: evaluator.reason ?? 'Evaluator returned failed without a reason.',
    };
  }
  if (imEvaluator && !imEvaluator.passed) {
    return {
      category: 'api_evaluator_failed',
      reason: imEvaluator.reason,
    };
  }
  if (calendarEvaluator && !calendarEvaluator.passed) {
    return {
      category: 'api_evaluator_failed',
      reason: calendarEvaluator.reason,
    };
  }

  const actions = events.filter(isActionExecutedEvent);
  const observations = result.observations.join(' ');
  if (actions.length > 0 && observations.includes('wait')) {
    return {
      category: 'max_steps_no_progress',
      reason: 'Run reached its step budget with only wait/skipped progress.',
    };
  }
  if (actions.length > 0) {
    return {
      category: 'max_steps_or_unfinished',
      reason: 'Run executed actions but did not reach finished/passed.',
    };
  }
  return { category: 'blocked_without_actions', reason: 'Run stopped before any action was executed.' };
}

async function optionalReportPath(runDir: string): Promise<string | undefined> {
  const reportPath = join(runDir, 'report.md');
  try {
    const reportStats = await stat(reportPath);
    return reportStats.isFile() ? reportPath : undefined;
  } catch {
    return undefined;
  }
}

function isActionExecutedEvent(event: TraceEvent): event is ActionExecutedEvent {
  return event.type === 'action.executed';
}

function isEvaluatorEvent(event: TraceEvent): event is EvaluatorEvent {
  return event.type === 'evaluator.vlm_screenshot';
}

function isFeishuImEvaluatorEvent(event: TraceEvent): event is FeishuImEvaluatorEvent {
  return event.type === 'evaluator.feishu_im_message_check';
}

function isFeishuCalendarEvaluatorEvent(event: TraceEvent): event is FeishuCalendarEvaluatorEvent {
  return event.type === 'evaluator.feishu_calendar_event_check';
}

function isRunErrorEvent(event: TraceEvent): event is RunErrorEvent {
  return event.type === 'run.error';
}

function isSafetyBlockEvent(event: TraceEvent): event is SafetyEvent {
  return (
    (event.type === 'action.safety' || event.type === 'vlm.action')
    && 'safety' in event
    && event.safety?.allowed === false
  );
}

function countByStatus(runs: RunSummary[]): Record<TaskRunResult['status'], number> {
  return {
    passed: runs.filter((run) => run.status === 'passed').length,
    failed: runs.filter((run) => run.status === 'failed').length,
    blocked: runs.filter((run) => run.status === 'blocked').length,
  };
}

function countBy<T>(items: T[], getKey: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function dateDiffMs(startedAt: string, endedAt: string): number {
  const diff = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(diff) && diff >= 0 ? diff : 0;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

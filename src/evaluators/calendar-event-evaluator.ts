import type { EvaluatorSpec, TaskSpec } from '../core/task-spec.js';
import type { LarkCliClient, LarkCliRunResult } from './lark-cli-client.js';

export interface FeishuCalendarEventEvaluation {
  type: 'feishu_calendar_event_check';
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
  lastResult?: {
    ok: boolean;
    exitCode: number | null;
    stderrText: string;
  };
}

type FeishuCalendarEventEvaluatorSpec = Extract<EvaluatorSpec, { type: 'feishu_calendar_event_check' }>;

export async function evaluateCalendarEventWithLarkCli(
  task: TaskSpec,
  client: LarkCliClient,
): Promise<FeishuCalendarEventEvaluation> {
  if (task.evaluator.type !== 'feishu_calendar_event_check') {
    throw new Error(`Unsupported evaluator for Calendar event check: ${task.evaluator.type}`);
  }

  const evaluator = task.evaluator;
  const timeoutMs = evaluator.timeoutMs ?? 10000;
  const pollIntervalMs = evaluator.pollIntervalMs ?? 1000;
  const startedAt = Date.now();
  let attempts = 0;
  let lastResult: LarkCliRunResult | undefined;

  while (Date.now() - startedAt <= timeoutMs) {
    attempts += 1;
    lastResult = await client.run(withJsonFormat(evaluator.larkCliArgs), { timeoutMs });
    if (lastResult.ok) {
      const matchedTitle = findMatchingEvent(lastResult.stdoutJson ?? lastResult.stdoutText, evaluator);
      if (matchedTitle) {
        return {
          type: 'feishu_calendar_event_check',
          passed: true,
          reason: 'Found expected calendar event fields from lark-cli output.',
          attempts,
          latencyMs: Date.now() - startedAt,
          larkCliArgs: withJsonFormat(evaluator.larkCliArgs),
          evidence: {
            expectedTitle: evaluator.expectedTitle,
            matchedTitle,
            calendarId: evaluator.calendarId,
            calendarName: evaluator.calendarName,
            expectedStartText: evaluator.expectedStartText,
            expectedEndText: evaluator.expectedEndText,
            expectedAttendee: evaluator.expectedAttendee,
          },
          lastResult: summarizeResult(lastResult),
        };
      }
    }

    if (Date.now() - startedAt + pollIntervalMs > timeoutMs) {
      break;
    }
    await sleep(pollIntervalMs);
  }

  return {
    type: 'feishu_calendar_event_check',
    passed: false,
    reason: lastResult?.ok
      ? 'lark-cli returned successfully, but expected calendar event fields were not found.'
      : `lark-cli command failed: ${lastResult?.stderrText ?? 'no command result'}`,
    attempts,
    latencyMs: Date.now() - startedAt,
    larkCliArgs: withJsonFormat(evaluator.larkCliArgs),
    lastResult: lastResult ? summarizeResult(lastResult) : undefined,
  };
}

function withJsonFormat(args: string[]): string[] {
  return args.includes('--format') ? args : [...args, '--format', 'json'];
}

function findMatchingEvent(output: unknown, evaluator: FeishuCalendarEventEvaluatorSpec): string | undefined {
  const strings = collectStrings(output).map((value) => ({
    raw: value,
    normalized: normalizeText(value),
  }));
  const requiredFields = [
    evaluator.expectedTitle,
    evaluator.expectedStartText,
    evaluator.expectedEndText,
    evaluator.expectedAttendee,
  ].filter((value): value is string => Boolean(value));

  const hasEveryField = requiredFields.every((field) => {
    const expected = normalizeText(field);
    return strings.some((candidate) => candidate.normalized.includes(expected));
  });
  if (!hasEveryField) {
    return undefined;
  }

  const expectedTitle = normalizeText(evaluator.expectedTitle);
  return strings.find((candidate) => candidate.normalized.includes(expectedTitle))?.raw;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((item) => collectStrings(item));
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  return [];
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function summarizeResult(result: LarkCliRunResult): FeishuCalendarEventEvaluation['lastResult'] {
  return {
    ok: result.ok,
    exitCode: result.exitCode,
    stderrText: result.stderrText,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

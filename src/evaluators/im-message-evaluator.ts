import type { EvaluatorSpec, TaskSpec } from '../core/task-spec.js';
import type { LarkCliClient, LarkCliRunResult } from './lark-cli-client.js';

export interface FeishuImMessageEvaluation {
  type: 'feishu_im_message_check';
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
  lastResult?: {
    ok: boolean;
    exitCode: number | null;
    stderrText: string;
  };
}

type FeishuImMessageEvaluatorSpec = Extract<EvaluatorSpec, { type: 'feishu_im_message_check' }>;

export async function evaluateImMessageWithLarkCli(
  task: TaskSpec,
  client: LarkCliClient,
): Promise<FeishuImMessageEvaluation> {
  if (task.evaluator.type !== 'feishu_im_message_check') {
    throw new Error(`Unsupported evaluator for IM message check: ${task.evaluator.type}`);
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
      const matchedText = findExpectedText(lastResult.stdoutJson ?? lastResult.stdoutText, evaluator);
      if (matchedText) {
        return {
          type: 'feishu_im_message_check',
          passed: true,
          reason: 'Found expected message text from lark-cli output.',
          attempts,
          latencyMs: Date.now() - startedAt,
          larkCliArgs: withJsonFormat(evaluator.larkCliArgs),
          evidence: {
            expectedText: evaluator.expectedText,
            matchedText,
            chatId: evaluator.chatId,
            chatName: evaluator.chatName,
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
    type: 'feishu_im_message_check',
    passed: false,
    reason: lastResult?.ok
      ? 'lark-cli returned successfully, but expected message text was not found.'
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

function findExpectedText(output: unknown, evaluator: FeishuImMessageEvaluatorSpec): string | undefined {
  const expected = normalizeText(evaluator.expectedText);
  for (const candidate of collectStrings(output)) {
    const normalizedCandidate = normalizeText(candidate);
    if (normalizedCandidate.includes(expected)) {
      return candidate;
    }
  }
  return undefined;
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

function summarizeResult(result: LarkCliRunResult): FeishuImMessageEvaluation['lastResult'] {
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

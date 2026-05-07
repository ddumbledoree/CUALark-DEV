import type { VlmProvider } from '../models/vlm-provider.js';
import type { ScreenshotResult } from '../operators/operator.js';
import type { TaskSpec } from '../core/task-spec.js';

export interface VlmScreenshotEvaluation {
  passed: boolean;
  rawContent: string;
  reason?: string;
  latencyMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export async function evaluateScreenshotWithVlm(
  task: TaskSpec,
  screenshot: ScreenshotResult,
  vlm: VlmProvider,
): Promise<VlmScreenshotEvaluation> {
  if (task.evaluator.type !== 'vlm_screenshot') {
    throw new Error(`Task evaluator must be vlm_screenshot, got ${task.evaluator.type}`);
  }

  const response = await vlm.complete({
    temperature: 0,
    image: {
      base64: screenshot.base64,
      mimeType: 'image/png',
    },
    messages: [
      {
        role: 'system',
        content: [
          '你是 CUA-Lark 的截图验收器，只判断结果，不输出动作。',
          '必须只输出 JSON object，不要 Markdown，不要额外解释。',
          'JSON schema: {"status":"passed"|"failed","reason":"简短原因"}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `任务 ID: ${task.id}`,
          `任务指令: ${task.instruction}`,
          `期望结果: ${task.expectedResult}`,
          `验收问题: ${task.evaluator.question}`,
          `期望状态: ${task.evaluator.expectedAnswer}`,
          '请根据截图判断任务是否达成。',
        ].join('\n'),
      },
    ],
  });

  const parsed = parseEvaluation(response.content);
  return {
    passed: parsed.status === task.evaluator.expectedAnswer,
    rawContent: response.content,
    reason: parsed.reason,
    latencyMs: response.latencyMs,
    usage: response.usage,
  };
}

function parseEvaluation(content: string): { status: 'passed' | 'failed'; reason?: string } {
  const jsonText = extractJson(content);
  const parsed = JSON.parse(jsonText) as { status?: unknown; reason?: unknown };

  if (parsed.status !== 'passed' && parsed.status !== 'failed') {
    throw new Error(`VLM evaluator status must be passed or failed: ${content}`);
  }

  return {
    status: parsed.status,
    reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
  };
}

function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return content.slice(start, end + 1);
  }

  return content.trim();
}

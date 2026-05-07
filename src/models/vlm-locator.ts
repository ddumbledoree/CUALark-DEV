import type { VlmProvider } from './vlm-provider.js';

export interface VlmLocateResult {
  found: boolean;
  x: number;
  y: number;
  confidence: number;
  reason: string;
  source: 'vlm' | 'calibrated_fallback';
  rawResponse: string;
  latencyMs: number;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface VlmLocateOptions {
  confidenceThreshold?: number;
}

export interface LocateTarget {
  description: string;
  uiType?: string;
  regionHint?: string;
  nearbyText?: string;
}

const LOCATOR_SYSTEM_PROMPT = [
  '你是 CUA-Lark 的 UI 元素定位器。你的任务是在截图中找到指定的 UI 元素，并返回其中心点的像素坐标。',
  '',
  '规则：',
  '1. 只输出一个 JSON object，不要输出 Markdown、解释或多余文本。',
  '2. 仔细观察截图，找到最符合描述的 UI 元素。',
  '3. 返回该元素可视区域中心点的像素坐标。坐标原点是截图左上角 (0,0)，向右 x 增大，向下 y 增大。',
  '4. 坐标必须是截图像素空间的绝对坐标，不是归一化坐标，不是百分比。',
  '5. 如果提供了元素类型，优先匹配该类型的 UI 元素（如 icon 匹配独立小图标，input 匹配输入框，button 匹配按钮）。',
  '6. 如果提供了搜索区域，只在指定区域内寻找。',
  '7. 如果提供了附近文本锚点，用它辅助确认目标元素（锚点文本在目标附近，但不是目标本身）。',
  '8. 如果截图中找不到该元素，将 found 设为 false，confidence 设为 0。',
  '9. confidence 范围 0.0-1.0，表示你对定位结果的确定程度。',
  '10. reason 字段简要说明你看到了什么以及为什么认为是这个位置。',
  '',
  'JSON schema:',
  '{"found":true|false,"x":<整数>,"y":<整数>,"confidence":<0.0-1.0>,"reason":"<简述>"}',
].join('\n');

export async function locateElement(
  screenshot: { base64: string; width?: number; height?: number },
  target: string | LocateTarget,
  vlm: VlmProvider,
  _options?: VlmLocateOptions,
): Promise<VlmLocateResult> {
  const width = screenshot.width ?? 2048;
  const height = screenshot.height ?? 1152;

  const t = typeof target === 'string' ? { description: target } : target;
  const userPrompt = buildLocatePrompt(t, width, height);

  const started = Date.now();
  const response = await vlm.complete({
    temperature: 0,
    image: {
      base64: screenshot.base64,
      mimeType: 'image/png',
    },
    messages: [
      { role: 'system', content: LOCATOR_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  });
  const latencyMs = Date.now() - started;

  return parseLocateResponse(response.content, latencyMs, response);
}

export function parseLocateResponse(
  content: string,
  latencyMs: number,
  response?: { model?: string; usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } },
): VlmLocateResult {
  const jsonStr = extractJson(content);
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  const found = parsed.found === true;
  const reason = typeof parsed.reason === 'string' ? parsed.reason : '';

  if (!found) {
    return {
      found: false,
      x: 0,
      y: 0,
      confidence: 0,
      reason,
      source: 'vlm',
      rawResponse: content,
      latencyMs,
      usage: response?.usage,
    };
  }

  if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') {
    throw new Error(`VLM locator response missing x/y fields: ${content}`);
  }

  let confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    found: true,
    x: Math.round(parsed.x),
    y: Math.round(parsed.y),
    confidence,
    reason,
    source: 'vlm',
    rawResponse: content,
    latencyMs,
    usage: response?.usage,
  };
}

function buildLocatePrompt(target: LocateTarget, width: number, height: number): string {
  const lines = [
    `目标元素描述: ${target.description}`,
  ];

  if (target.uiType) {
    lines.push(`元素类型: ${target.uiType}`);
  }
  if (target.regionHint) {
    const regionNames: Record<string, string> = {
      left_sidebar: '左侧导航栏/侧边栏',
      top_bar: '顶部工具栏/标题栏',
      main_content: '主内容区域',
      right_panel: '右侧面板',
      bottom_bar: '底部栏/状态栏',
    };
    lines.push(`搜索区域: ${regionNames[target.regionHint] ?? target.regionHint}`);
  }
  if (target.nearbyText) {
    lines.push(`附近文本锚点: ${target.nearbyText}`);
  }

  lines.push(`屏幕尺寸: ${width}x${height}`);
  lines.push('请找到该元素并返回中心坐标。');

  return lines.join('\n');
}

export interface StateVerifyResult {
  changed: boolean;
  reason: string;
  latencyMs: number;
  rawResponse: string;
}

export async function verifyStateChange(
  screenshot: { base64: string },
  expectedState: string,
  vlm: VlmProvider,
): Promise<StateVerifyResult> {
  const systemPrompt = [
    '你是 CUA-Lark 的页面状态验证器。你的任务是判断当前截图是否符合预期的页面状态。',
    '',
    '规则：',
    '1. 只输出一个 JSON object，不要输出 Markdown、解释或多余文本。',
    '2. 仔细观察截图，判断页面状态是否符合预期。',
    '3. 如果符合，changed 设为 true；否则设为 false。',
    '4. reason 字段简要说明你看到了什么以及是否符合预期。',
    '',
    'JSON schema:',
    '{"changed":true|false,"reason":"<简述>"}',
  ].join('\n');

  const userPrompt = `预期状态: ${expectedState}\n请判断当前截图是否符合该预期状态。`;

  const started = Date.now();
  const response = await vlm.complete({
    temperature: 0,
    image: {
      base64: screenshot.base64,
      mimeType: 'image/png',
    },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  const latencyMs = Date.now() - started;

  const jsonStr = extractJson(response.content);
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  return {
    changed: parsed.changed === true,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    latencyMs,
    rawResponse: response.content,
  };
}

export interface CursorCalibrationResult {
  cursorX: number;
  cursorY: number;
  targetX: number;
  targetY: number;
  offsetX: number;
  offsetY: number;
  calibratedX: number;
  calibratedY: number;
  latencyMs: number;
}

export async function calibrateCursor(
  screenshot: { base64: string; width?: number; height?: number },
  targetDescription: string,
  vlm: VlmProvider,
): Promise<CursorCalibrationResult> {
  const width = screenshot.width ?? 2048;
  const height = screenshot.height ?? 1152;

  const prompt = [
    `截图尺寸: ${width}x${height}`,
    '',
    '请找到以下两个位置并返回像素坐标：',
    `1. 鼠标光标（小箭头）的像素坐标`,
    `2. 目标元素「${targetDescription}」的中心像素坐标`,
    '',
    '只输出JSON: {"cursor_x":整数,"cursor_y":整数,"target_x":整数,"target_y":整数}',
  ].join('\n');

  const started = Date.now();
  const response = await vlm.complete({
    temperature: 0,
    image: { base64: screenshot.base64, mimeType: 'image/png' },
    messages: [{ role: 'user', content: prompt }],
  });
  const latencyMs = Date.now() - started;

  const jsonStr = extractJson(response.content);
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  const cursorX = typeof parsed.cursor_x === 'number' ? Math.round(parsed.cursor_x) : 0;
  const cursorY = typeof parsed.cursor_y === 'number' ? Math.round(parsed.cursor_y) : 0;
  const targetX = typeof parsed.target_x === 'number' ? Math.round(parsed.target_x) : 0;
  const targetY = typeof parsed.target_y === 'number' ? Math.round(parsed.target_y) : 0;

  const offsetX = targetX - cursorX;
  const offsetY = targetY - cursorY;

  return {
    cursorX,
    cursorY,
    targetX,
    targetY,
    offsetX,
    offsetY,
    calibratedX: cursorX,
    calibratedY: cursorY,
    latencyMs,
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

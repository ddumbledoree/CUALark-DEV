import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { evaluateCalendarEventWithLarkCli, type FeishuCalendarEventEvaluation } from '../evaluators/calendar-event-evaluator.js';
import { evaluateImMessageWithLarkCli, type FeishuImMessageEvaluation } from '../evaluators/im-message-evaluator.js';
import type { LarkCliClient } from '../evaluators/lark-cli-client.js';
import { evaluateScreenshotWithVlm, type VlmScreenshotEvaluation } from '../evaluators/vlm-screenshot-evaluator.js';
import { locateElement, verifyStateChange, type LocateTarget, type VlmLocateResult } from '../models/vlm-locator.js';
import type { VlmProvider } from '../models/vlm-provider.js';
import type { CuaOperator, ExecuteResult, OperatorAction, ScreenshotResult } from '../operators/operator.js';
import { generateMarkdownReport } from '../reports/markdown-report.js';
import { checkActionSafety } from './action-safety.js';
import { createPlanner, type PlannerStep } from './planner.js';
import type { TaskRunResult, TaskSpec } from './task-spec.js';

export interface AgentLoopV2Options {
  traceDir: string;
  vlm: VlmProvider;
  larkCli?: LarkCliClient;
  locatorMaxRetries?: number;
  locatorConfidenceThreshold?: number;
  skipReset?: boolean;
}

export async function runAgentLoopV2(
  task: TaskSpec,
  operator: CuaOperator,
  options: AgentLoopV2Options,
): Promise<TaskRunResult> {
  const startedAt = new Date().toISOString();
  const observations: string[] = [];
  const runId = `${task.id}-v2-${Date.now()}`;
  const runDir = join(options.traceDir, runId);
  const screenshotDir = join(runDir, 'screenshots');
  const events: unknown[] = [{ type: 'task.loaded', task }];

  const maxRetries = options.locatorMaxRetries ?? 2;
  const confidenceThreshold = options.locatorConfidenceThreshold ?? 0.5;

  let lastScreenshot: ScreenshotResult | undefined;
  let evaluation: VlmScreenshotEvaluation | undefined;
  let imMessageEvaluation: FeishuImMessageEvaluation | undefined;
  let calendarEventEvaluation: FeishuCalendarEventEvaluation | undefined;
  let finalExecuteResult: ExecuteResult | undefined;
  let status: TaskRunResult['status'] = 'blocked';

  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'task.json'), `${JSON.stringify(task, null, 2)}\n`, 'utf-8');

  observations.push(`Loaded task ${task.id}: ${task.title}`);
  observations.push(`Target product: ${task.targetProduct}`);

  try {
    // Initial screenshot
    const initialScreenshot = await operator.screenshot();
    lastScreenshot = initialScreenshot;
    const initialScreenshotPath = await writeScreenshot(initialScreenshot, screenshotDir, 0);
    events.push({
      type: 'screenshot.captured',
      step: 0,
      path: initialScreenshotPath,
      scaleFactor: initialScreenshot.scaleFactor,
      width: initialScreenshot.width,
      height: initialScreenshot.height,
    });

    // Reset to initial state: ensure Feishu is on the main messages page with no popups
    if (options.skipReset) {
      lastScreenshot = initialScreenshot;
      events.push({ type: 'state.check_initial', result: { changed: true, reason: 'Skipped by CUA_SKIP_RESET' } });
      observations.push('Initial state reset: skipped');
    } else {
      lastScreenshot = await resetToInitialState(operator, options.vlm, events, initialScreenshot, observations);
    }

    // Planner
    const planner = createPlanner(task);
    const steps = planner.plan();
    events.push({ type: 'planner.steps', steps, plannerType: 'rule-based' });
    observations.push(`Planner generated ${steps.length} steps`);

    // Execute steps
    let screenshotCounter = 1;
    for (const step of steps) {
      const stepNumber = step.index + 1;

      if (step.action === 'wait') {
        const waitAction: OperatorAction = { type: 'wait', waitMs: step.waitMs ?? 1000 };
        const safety = checkActionSafety(task, waitAction);
        events.push({ type: 'action.safety', step: stepNumber, action: waitAction, safety });
        if (!safety.allowed) {
          throw new Error(`Action safety blocked wait: ${safety.reason}`);
        }
        const executeResult = await operator.execute(waitAction);
        finalExecuteResult = executeResult;
        events.push({ type: 'action.executed', step: stepNumber, action: waitAction, executeResult });
        observations.push(`Step ${stepNumber}: wait ${step.waitMs ?? 1000}ms`);

        const afterScreenshot = await operator.screenshot();
        lastScreenshot = afterScreenshot;
        const waitScreenshotPath = await writeScreenshot(afterScreenshot, screenshotDir, screenshotCounter++);
        events.push({ type: 'screenshot.captured', step: stepNumber, path: waitScreenshotPath, scaleFactor: afterScreenshot.scaleFactor, width: afterScreenshot.width, height: afterScreenshot.height });
        continue;
      }

      if (step.action === 'hotkey') {
        const hotkeyAction: OperatorAction = { type: 'hotkey', key: step.hotkey ?? '' };
        const safety = checkActionSafety(task, hotkeyAction);
        events.push({ type: 'action.safety', step: stepNumber, action: hotkeyAction, safety });
        if (!safety.allowed) {
          throw new Error(`Action safety blocked hotkey: ${safety.reason}`);
        }
        if (isSendHotkey(hotkeyAction)) {
          const sendScreenshot = await operator.screenshot();
          const sendGuard = await verifySendContext(sendScreenshot, task, options.vlm);
          events.push({ type: 'send.guard', step: stepNumber, result: sendGuard });
          if (!sendGuard.changed) {
            throw new Error(`Send guard blocked hotkey ${hotkeyAction.key}: ${sendGuard.reason}`);
          }
        }
        const executeResult = await operator.execute(hotkeyAction);
        finalExecuteResult = executeResult;
        events.push({ type: 'action.executed', step: stepNumber, action: hotkeyAction, executeResult });
        observations.push(`Step ${stepNumber}: hotkey ${step.hotkey}`);

        const afterScreenshot = await operator.screenshot();
        lastScreenshot = afterScreenshot;
        const hotkeyScreenshotPath = await writeScreenshot(afterScreenshot, screenshotDir, screenshotCounter++);
        events.push({ type: 'screenshot.captured', step: stepNumber, path: hotkeyScreenshotPath, scaleFactor: afterScreenshot.scaleFactor, width: afterScreenshot.width, height: afterScreenshot.height });
        continue;
      }

      if (step.action === 'click') {
        const clickAction: OperatorAction = { type: 'click', x: step.x, y: step.y };
        const safety = checkActionSafety(task, clickAction);
        events.push({ type: 'action.safety', step: stepNumber, action: clickAction, safety });
        if (!safety.allowed) {
          throw new Error(`Action safety blocked click: ${safety.reason}`);
        }
        const executeResult = await operator.execute(clickAction);
        finalExecuteResult = executeResult;
        events.push({ type: 'action.executed', step: stepNumber, action: clickAction, executeResult });
        observations.push(`Step ${stepNumber}: fixed click at (${step.x}, ${step.y})`);

        const afterScreenshot = await operator.screenshot();
        lastScreenshot = afterScreenshot;
        const cursorMarker = executeResult.cursorPosition;
        const clickScreenshotPath = await writeScreenshot(afterScreenshot, screenshotDir, screenshotCounter++, cursorMarker);
        events.push({ type: 'screenshot.captured', step: stepNumber, path: clickScreenshotPath, scaleFactor: afterScreenshot.scaleFactor, width: afterScreenshot.width, height: afterScreenshot.height, cursorMarker });

        if (step.expectedState) {
          const verifyResult = await verifyStateChange(afterScreenshot, step.expectedState, options.vlm);
          events.push({ type: 'state.verify', step: stepNumber, expectedState: step.expectedState, result: verifyResult });
          if (!verifyResult.changed) {
            throw new Error(`State verification failed after fixed click: ${verifyResult.reason}`);
          }
          observations.push(`Step ${stepNumber}: state verification passed - ${verifyResult.reason}`);
        }
        continue;
      }

      if (step.action === 'type') {
        const typeAction: OperatorAction = { type: 'type', content: step.typeContent ?? '' };
        const safety = checkActionSafety(task, typeAction);
        events.push({ type: 'action.safety', step: stepNumber, action: typeAction, safety });
        if (!safety.allowed) {
          throw new Error(`Action safety blocked type: ${safety.reason}`);
        }
        const executeResult = await operator.execute(typeAction);
        finalExecuteResult = executeResult;
        events.push({ type: 'action.executed', step: stepNumber, action: typeAction, executeResult, source: 'focused_input' });
        observations.push(`Step ${stepNumber}: type "${step.typeContent ?? ''}" into focused input`);

        const afterScreenshot = await operator.screenshot();
        lastScreenshot = afterScreenshot;
        const typeScreenshotPath = await writeScreenshot(afterScreenshot, screenshotDir, screenshotCounter++);
        events.push({ type: 'screenshot.captured', step: stepNumber, path: typeScreenshotPath, scaleFactor: afterScreenshot.scaleFactor, width: afterScreenshot.width, height: afterScreenshot.height });
        continue;
      }

      // locate_and_click or locate_and_type: use VLM locator with structured target
      const target: LocateTarget = {
        description: step.targetDescription ?? '',
        uiType: step.uiType,
        regionHint: step.regionHint,
        nearbyText: step.nearbyText,
      };

      let locateResult = await attemptLocate(operator, target, options.vlm, events, stepNumber);
      screenshotCounter++;

      if (!locateResult) {
        locateResult = await retryLocate(operator, target, options.vlm, events, stepNumber, maxRetries);
        screenshotCounter += maxRetries;
      }

      // Check if locator succeeded
      if (!locateResult || !locateResult.found || locateResult.confidence < confidenceThreshold) {
        events.push({
          type: 'locator.blocked',
          step: stepNumber,
          reason: locateResult
            ? `VLM confidence ${locateResult.confidence} < threshold ${confidenceThreshold}`
            : 'VLM locator returned no result',
        });
        throw new Error(`VLM locator failed for step ${stepNumber}: ${target.description}`);
      } else {
        // VLM locator succeeded
        const clickAction: OperatorAction = {
          type: 'click',
          x: locateResult.x,
          y: locateResult.y,
        };
        const safety = checkActionSafety(task, clickAction);
        events.push({ type: 'action.safety', step: stepNumber, action: clickAction, safety });
        if (!safety.allowed) {
          throw new Error(`Action safety blocked click: ${safety.reason}`);
        }
        const executeResult = await operator.execute(clickAction);
        finalExecuteResult = executeResult;
        events.push({ type: 'action.executed', step: stepNumber, action: clickAction, executeResult, source: 'vlm' });
        observations.push(`Step ${stepNumber}: VLM click at (${locateResult.x}, ${locateResult.y}) confidence=${locateResult.confidence}`);

        // If locate_and_type, also type
        if (step.action === 'locate_and_type' && step.typeContent) {
          const typeAction: OperatorAction = {
            type: 'type',
            content: step.typeContent,
          };
          const typeSafety = checkActionSafety(task, typeAction);
          events.push({ type: 'action.safety', step: stepNumber, action: typeAction, safety: typeSafety });
          if (!typeSafety.allowed) {
            throw new Error(`Action safety blocked type: ${typeSafety.reason}`);
          }
          const typeResult = await operator.execute(typeAction);
          finalExecuteResult = typeResult;
          events.push({ type: 'action.executed', step: stepNumber, action: typeAction, executeResult: typeResult, source: 'vlm' });
          observations.push(`Step ${stepNumber}: VLM type "${step.typeContent}"`);
        }
      }

      // Screenshot after step
      const afterScreenshot = await operator.screenshot();
      lastScreenshot = afterScreenshot;
      const cursorMarker = finalExecuteResult?.cursorPosition;
      const stepScreenshotPath = await writeScreenshot(afterScreenshot, screenshotDir, screenshotCounter++, cursorMarker);
      events.push({ type: 'screenshot.captured', step: stepNumber, path: stepScreenshotPath, scaleFactor: afterScreenshot.scaleFactor, width: afterScreenshot.width, height: afterScreenshot.height, cursorMarker });

      // State verification after locate_and_click
      if (step.action === 'locate_and_click' && step.expectedState) {
        const verifyResult = await verifyStateChange(afterScreenshot, step.expectedState, options.vlm);
        events.push({
          type: 'state.verify',
          step: stepNumber,
          expectedState: step.expectedState,
          result: verifyResult,
        });

        if (!verifyResult.changed) {
          observations.push(`Step ${stepNumber}: state verification FAILED - ${verifyResult.reason}`);
          throw new Error(`State verification failed after VLM action: ${verifyResult.reason}`);
        } else {
          observations.push(`Step ${stepNumber}: state verification passed - ${verifyResult.reason}`);
        }
      }
    }

    // Evaluator
    if (task.evaluator.type === 'vlm_screenshot') {
      if (!lastScreenshot) {
        throw new Error('No screenshot available for vlm_screenshot evaluator.');
      }
      evaluation = await evaluateScreenshotWithVlm(task, lastScreenshot, options.vlm);
      events.push({ type: 'evaluator.vlm_screenshot', evaluation });
    }
    if (task.evaluator.type === 'feishu_im_message_check') {
      if (!options.larkCli) {
        throw new Error('lark-cli client is required for feishu_im_message_check evaluator.');
      }
      imMessageEvaluation = await evaluateImMessageWithLarkCli(task, options.larkCli);
      events.push({ type: 'evaluator.feishu_im_message_check', evaluation: imMessageEvaluation });
    }
    if (task.evaluator.type === 'feishu_calendar_event_check') {
      if (!options.larkCli) {
        throw new Error('lark-cli client is required for feishu_calendar_event_check evaluator.');
      }
      calendarEventEvaluation = await evaluateCalendarEventWithLarkCli(task, options.larkCli);
      events.push({ type: 'evaluator.feishu_calendar_event_check', evaluation: calendarEventEvaluation });
    }

    status = resolveStatus(task, finalExecuteResult, evaluation, imMessageEvaluation, calendarEventEvaluation);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    events.push({ type: 'run.error', message });
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

  // Auto-generate report when passed
  if (status === 'passed') {
    try {
      const report = await generateMarkdownReport({ runDir });
      observations.push(`Report: ${report.outputPath}`);
    } catch (reportError) {
      observations.push(`Report generation failed: ${reportError instanceof Error ? reportError.message : String(reportError)}`);
    }
  }

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

function isSendHotkey(action: OperatorAction): boolean {
  if (action.type !== 'hotkey') {
    return false;
  }

  const key = (action.key ?? '').toLowerCase().replace(/\s+/g, '').replace(/control/g, 'ctrl');
  return key === 'enter' || key === 'return' || key === 'ctrl+enter';
}

async function verifySendContext(
  screenshot: ScreenshotResult,
  task: TaskSpec,
  vlm: VlmProvider,
) {
  const allowedTargets = [
    ...(task.safety.allowedChats ?? []),
    ...(task.safety.allowedUsers ?? []),
  ];
  const allowedTexts = task.safety.allowedMessageTexts ?? [];
  const expectedState = [
    '当前截图必须显示正在向白名单目标会话发送消息。',
    allowedTargets.length ? `白名单目标会话名称必须是以下之一: ${allowedTargets.join('、')}` : '',
    allowedTexts.length ? `输入框或待发送内容必须是以下之一: ${allowedTexts.join('、')}` : '',
    '如果当前会话不是白名单目标，或者看不到待发送内容，返回 changed=false。',
  ].filter(Boolean).join('\n');

  return verifyStateChange(screenshot, expectedState, vlm);
}

const INITIAL_STATE_DESCRIPTION = '飞书桌面端主消息列表页面：左侧显示会话列表，右侧显示当前聊天内容，没有搜索弹窗、设置页面、日历页面或其他弹窗遮挡';

async function resetToInitialState(
  operator: CuaOperator,
  vlm: VlmProvider,
  events: unknown[],
  currentScreenshot: ScreenshotResult,
  observations: string[],
): Promise<ScreenshotResult> {
  // Check if we're already in initial state
  const checkResult = await verifyStateChange(currentScreenshot, INITIAL_STATE_DESCRIPTION, vlm);
  events.push({ type: 'state.check_initial', result: checkResult });

  if (checkResult.changed) {
    observations.push(`Initial state check: already in clean state - ${checkResult.reason}`);
    return currentScreenshot;
  }

  observations.push(`Initial state check: NOT in clean state - ${checkResult.reason}`);
  observations.push('Attempting to reset to initial state...');

  // Strategy: use deterministic shortcuts to get back to message list
  const maxResetAttempts = 3;
  let screenshot = currentScreenshot;

  for (let attempt = 1; attempt <= maxResetAttempts; attempt++) {
    // Step 1: Dismiss any popup by clicking the main content area center
    const centerX = Math.round((currentScreenshot.width ?? 2048) * 0.7);
    const centerY = Math.round((currentScreenshot.height ?? 1152) * 0.5);
    await operator.execute({ type: 'click', x: centerX, y: centerY });
    await operator.execute({ type: 'wait', waitMs: 500 });

    // Step 2: Use Alt+Num1 to switch to first tab (消息) - reliable in Feishu
    await operator.execute({ type: 'hotkey', key: 'alt+num1' });
    await operator.execute({ type: 'wait', waitMs: 800 });

    // Verify state
    screenshot = await operator.screenshot();
    const recheck = await verifyStateChange(screenshot, INITIAL_STATE_DESCRIPTION, vlm);
    events.push({ type: 'state.check_initial', attempt, result: recheck });

    if (recheck.changed) {
      observations.push(`Reset successful after attempt ${attempt}: ${recheck.reason}`);
      return screenshot;
    }

    observations.push(`Reset attempt ${attempt}: still not in initial state - ${recheck.reason}`);
  }

  observations.push('Reset to initial state did not fully succeed, proceeding anyway');
  return screenshot;
}

async function attemptLocate(
  operator: CuaOperator,
  target: LocateTarget,
  vlm: VlmProvider,
  events: unknown[],
  stepNumber: number,
): Promise<VlmLocateResult | undefined> {
  try {
    const screenshot = await operator.screenshot();
    const result = await locateElement(screenshot, target, vlm);
    events.push({
      type: 'locator.vlm',
      step: stepNumber,
      description: target.description,
      result,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    events.push({
      type: 'locator.vlm',
      step: stepNumber,
      description: target.description,
      result: { found: false, x: 0, y: 0, confidence: 0, reason: message, source: 'vlm' as const, rawResponse: '', latencyMs: 0 },
      error: message,
    });
    return undefined;
  }
}

async function retryLocate(
  operator: CuaOperator,
  target: LocateTarget,
  vlm: VlmProvider,
  events: unknown[],
  stepNumber: number,
  maxRetries: number,
): Promise<VlmLocateResult | undefined> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    events.push({
      type: 'locator.retry',
      step: stepNumber,
      attempt,
      maxRetries,
    });

    try {
      const screenshot = await operator.screenshot();
      const result = await locateElement(screenshot, target, vlm);
      events.push({
        type: 'locator.vlm',
        step: stepNumber,
        description: target.description,
        result,
        attempt,
      });
      if (result.found && result.confidence > 0) {
        return result;
      }
    } catch {
      // Continue retrying
    }
  }
  return undefined;
}

async function writeScreenshot(
  screenshot: ScreenshotResult,
  screenshotDir: string,
  step: number,
  cursorMarker?: { x: number; y: number },
): Promise<string> {
  await mkdir(screenshotDir, { recursive: true });
  const screenshotPath = join(screenshotDir, `${String(step).padStart(3, '0')}.png`);
  let pngBuffer: Buffer = Buffer.from(screenshot.base64, 'base64');
  if (cursorMarker) {
    pngBuffer = Buffer.from(drawCursorMarker(pngBuffer, cursorMarker.x, cursorMarker.y));
  }
  await writeFile(screenshotPath, pngBuffer);
  return screenshotPath;
}

function drawCursorMarker(png: Buffer, logicalX: number, logicalY: number): Buffer {
  const width = png.length >= 24 ? png.readUInt32BE(16) : 0;
  const height = png.length >= 24 ? png.readUInt32BE(20) : 0;
  if (!width || !height) return png;

  // Decode PNG pixel data (unfilter each row)
  const channels = 4;
  const rowBytes = width * channels;
  const rawData = decodePngRaw(png, width, height, channels);
  if (!rawData) return png;

  const x = Math.round(logicalX);
  const y = Math.round(logicalY);
  const size = 8; // crosshair radius
  const color = [255, 0, 0, 200]; // red, semi-transparent

  for (let dy = -size; dy <= size; dy++) {
    for (let dx = -size; dx <= size; dx++) {
      // Draw crosshair: horizontal and vertical lines, plus a circle outline
      const isHorizontal = dy === 0 && Math.abs(dx) <= size;
      const isVertical = dx === 0 && Math.abs(dy) <= size;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isCircle = dist >= size - 1 && dist <= size + 1;
      if (!isHorizontal && !isVertical && !isCircle) continue;

      const px = x + dx;
      const py = y + dy;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;

      const offset = (py * width + px) * channels;
      // Alpha blend
      const alpha = color[3] / 255;
      rawData[offset] = Math.round(color[0] * alpha + rawData[offset] * (1 - alpha));
      rawData[offset + 1] = Math.round(color[1] * alpha + rawData[offset + 1] * (1 - alpha));
      rawData[offset + 2] = Math.round(color[2] * alpha + rawData[offset + 2] * (1 - alpha));
      rawData[offset + 3] = 255;
    }
  }

  // Re-encode as PNG (simple filter=none, write IDAT with zlib deflate)
  return encodeRawToPng(rawData, width, height, channels, png);
}

function decodePngRaw(png: Buffer, width: number, height: number, channels: number): Uint8Array | null {
  try {
    const { inflateSync } = require('node:zlib') as typeof import('node:zlib');
    const chunks: Buffer[] = [];
    let offset = 8; // skip signature
    while (offset < png.length) {
      const len = png.readUInt32BE(offset);
      const type = png.subarray(offset + 4, offset + 8).toString('ascii');
      const data = png.subarray(offset + 8, offset + 8 + len);
      if (type === 'IDAT') chunks.push(data);
      offset += 12 + len;
    }
    const compressed = Buffer.concat(chunks);
    const inflated = inflateSync(compressed);
    const rowBytes = width * channels;
    const raw = new Uint8Array(height * rowBytes);
    for (let y = 0; y < height; y++) {
      const srcOffset = y * (1 + rowBytes);
      const filter = inflated[srcOffset];
      const srcRow = inflated.subarray(srcOffset + 1, srcOffset + 1 + rowBytes);
      const dstOffset = y * rowBytes;
      raw.set(srcRow, dstOffset);
      // Unfilter: filter=0 (none) is most common for screenshots
      if (filter === 1) { // Sub
        for (let i = channels; i < rowBytes; i++) {
          raw[dstOffset + i] = (raw[dstOffset + i] + raw[dstOffset + i - channels]) & 0xff;
        }
      } else if (filter === 2) { // Up
        if (y > 0) {
          for (let i = 0; i < rowBytes; i++) {
            raw[dstOffset + i] = (raw[dstOffset + i] + raw[dstOffset - rowBytes + i]) & 0xff;
          }
        }
      }
    }
    return raw;
  } catch {
    return null;
  }
}

function encodeRawToPng(raw: Uint8Array, width: number, height: number, channels: number, originalPng: Buffer): Buffer {
  const { deflateSync } = require('node:zlib') as typeof import('node:zlib');
  const rowBytes = width * channels;
  const filtered = Buffer.alloc(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    filtered[y * (1 + rowBytes)] = 0; // filter = None
    Buffer.from(raw.buffer, raw.byteOffset + y * rowBytes, rowBytes).copy(filtered, y * (1 + rowBytes) + 1);
  }
  const compressed = deflateSync(filtered);

  // Build PNG: signature + IHDR + IDAT + IEND, copying other chunks from original
  const parts: Buffer[] = [originalPng.subarray(0, 8)]; // signature

  let offset = 8;
  while (offset < originalPng.length) {
    const len = originalPng.readUInt32BE(offset);
    const type = originalPng.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') { offset += 12 + len; continue; } // skip old IDAT
    if (type === 'IEND') break; // will append IEND last
    parts.push(originalPng.subarray(offset, offset + 12 + len));
    offset += 12 + len;
  }

  // New IDAT chunk
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(compressed.length);
  const idatType = Buffer.from('IDAT');
  const idatCrc = crc32(Buffer.concat([idatType, compressed]));
  const idatCrcBuf = Buffer.alloc(4);
  idatCrcBuf.writeUInt32BE(idatCrc >>> 0);
  parts.push(Buffer.concat([idatLen, idatType, compressed, idatCrcBuf]));

  // IEND
  const iend = Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  parts.push(iend);

  return Buffer.concat(parts);
}

// Minimal CRC32 for PNG chunks
const crc32Table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crc32Table[n] = c;
}
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crc32Table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
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

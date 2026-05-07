import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { NutJSOperator } from '@ui-tars/operator-nut-js';

import type {
  CuaOperator,
  ExecuteResult,
  OperatorAction,
  OperatorOptions,
  ScreenshotResult,
} from './operator.js';

type NutScreenshot = {
  base64: string;
  scaleFactor: number;
};

const execFileAsync = promisify(execFile);

export class FeishuDesktopOperator implements CuaOperator {
  readonly name = 'feishu-desktop';

  private readonly nutOperator = new NutJSOperator();
  private readonly options: Required<Omit<OperatorOptions, 'focusStartBox' | 'focusExecutablePath'>> & {
    focusStartBox?: string;
    focusExecutablePath?: string;
  };
  private lastScreenshot?: ScreenshotResult;

  constructor(options: OperatorOptions = {}) {
    this.options = {
      screenWidth: options.screenWidth ?? 2048,
      screenHeight: options.screenHeight ?? 1152,
      focusMode: options.focusMode ?? 'app-activate',
      focusWindowTitles: options.focusWindowTitles ?? ['飞书', 'Feishu', 'Lark'],
      focusProcessNames: options.focusProcessNames ?? ['Feishu', 'Lark'],
      focusClassNames: options.focusClassNames ?? ['Chrome_WidgetWin_1'],
      focusExecutablePath: options.focusExecutablePath,
      focusStartBox: options.focusStartBox,
      postActionDelayMs: options.postActionDelayMs ?? 300,
    };
  }

  async screenshot(): Promise<ScreenshotResult> {
    await this.ensureFocused();

    const shot = (await this.nutOperator.screenshot()) as NutScreenshot;
    const dimensions = readPngDimensions(shot.base64);
    const result = {
      ...shot,
      ...dimensions,
    };
    this.lastScreenshot = result;
    return result;
  }

  async execute(action: OperatorAction): Promise<ExecuteResult> {
    await this.ensureFocused();

    if (action.type === 'note') {
      return withCursorTelemetry({ status: 'skipped', action, message: action.note }, action, this.options.screenWidth, this.options.screenHeight);
    }

    if (action.type === 'screenshot') {
      await this.screenshot();
      return withCursorTelemetry({ status: 'success', action }, action, this.options.screenWidth, this.options.screenHeight);
    }

    if (action.type === 'wait') {
      await sleep(action.waitMs ?? 1000);
      return withCursorTelemetry({ status: 'success', action }, action, this.options.screenWidth, this.options.screenHeight);
    }

    const actionType = toNutActionType(action);
    const scaleFactor = this.lastScreenshot?.scaleFactor ?? 1;
    const logicalWidth = this.lastScreenshot?.width ?? this.options.screenWidth;
    const logicalHeight = this.lastScreenshot?.height ?? this.options.screenHeight;
    // VLM returns coordinates in logical screenshot space (e.g. 2048x1152).
    // NutJS mouse operates in physical pixel space (e.g. 2560x1440).
    // Normalize VLM coords by LOGICAL dimensions → [0,1] range.
    // Pass PHYSICAL dimensions to NutJS so it denormalizes to physical pixels.
    const physicalWidth = logicalWidth * scaleFactor;
    const physicalHeight = logicalHeight * scaleFactor;
    const actionInputs = toNutActionInputs(action, logicalWidth, logicalHeight);
    const requestedPoint = getRequestedPoint(action, physicalWidth, physicalHeight);
    const cursorBeforeClick = requestedPoint
      ? await this.moveToRequestedPointForTelemetry(actionInputs, physicalWidth, physicalHeight, scaleFactor)
      : undefined;

    // NutJSOperator reuses the UI-TARS action shape, keeping coordinate handling auditable.
    const result = await this.executeNutActionWithTypeFallback(
      action,
      actionType,
      actionInputs,
      physicalWidth,
      physicalHeight,
      scaleFactor,
    );

    await sleep(this.options.postActionDelayMs);
    return withCursorTelemetry({
      status: action.type === 'finished' ? 'end' : 'success',
      action,
      message: JSON.stringify(result ?? {}),
    }, action, physicalWidth, physicalHeight, cursorBeforeClick);
  }

  private async moveToRequestedPointForTelemetry(
    actionInputs: Record<string, string>,
    screenWidth: number,
    screenHeight: number,
    scaleFactor: number,
  ): Promise<{ x: number; y: number } | undefined> {
    await this.nutOperator.execute({
      parsedPrediction: {
        thought: 'Move cursor to requested point before click telemetry.',
        reflection: 'Pre-click telemetry measures where the cursor lands before button down.',
        action_type: 'mouse_move',
        action_inputs: actionInputs,
      },
      screenWidth,
      screenHeight,
      scaleFactor,
      prediction: 'Action: mouse_move',
      factors: [1, 1] as [number, number],
    });
    await sleep(50);
    return readCursorPosition();
  }

  private async ensureFocused(): Promise<void> {
    if (this.options.focusMode === 'app-activate') {
      const activated = await activateWindowByTitle(this.options.focusWindowTitles);
      if (activated) {
        await sleep(this.options.postActionDelayMs);
        return;
      }

      const processActivated = await activateWindowByProcess({
        processNames: this.options.focusProcessNames,
        classNames: this.options.focusClassNames,
        titles: this.options.focusWindowTitles,
        executablePath: this.options.focusExecutablePath,
      });
      if (processActivated) {
        await sleep(this.options.postActionDelayMs);
        return;
      }

      throw new Error(
        `Unable to activate Feishu window by titles: ${this.options.focusWindowTitles.join(', ')} ` +
          `or processes: ${this.options.focusProcessNames.join(', ')}`,
      );
    }

    if (!this.options.focusStartBox) {
      throw new Error('CUA_FEISHU_FOCUS_BOX is required when taskbar focus fallback is used.');
    }

    // Taskbar focus is a fallback for known local layouts; title/process activation is preferred.
    const scaleFactor = this.lastScreenshot?.scaleFactor ?? 1;
    const logicalWidth = this.lastScreenshot?.width ?? this.options.screenWidth;
    const logicalHeight = this.lastScreenshot?.height ?? this.options.screenHeight;
    const physicalWidth = logicalWidth * scaleFactor;
    const physicalHeight = logicalHeight * scaleFactor;
    await this.nutOperator.execute({
      parsedPrediction: {
        thought: 'Focus Feishu desktop before capturing or executing a task sequence.',
        reflection: 'Taskbar focus is used only when window activation cannot recover Feishu.',
        action_type: 'click',
        action_inputs: {
          start_box: this.options.focusStartBox,
        },
      },
      screenWidth: physicalWidth,
      screenHeight: physicalHeight,
      scaleFactor,
      prediction: 'Action: click',
      factors: [1, 1],
    });
    await sleep(this.options.postActionDelayMs);
  }

  private async executeNutActionWithTypeFallback(
    action: OperatorAction,
    actionType: string,
    actionInputs: Record<string, string>,
    screenWidth: number,
    screenHeight: number,
    scaleFactor: number,
  ): Promise<unknown> {
    if (action.type === 'type' && action.content && hasNonAscii(action.content)) {
      // 中文等非 ASCII 输入优先走剪贴板，避免 NutJS type 静默失败或输入法状态干扰。
      await setClipboardText(action.content);
      await this.nutOperator.execute({
        parsedPrediction: {
          thought: 'Paste audited non-ASCII text through clipboard.',
          reflection: 'Clipboard paste is more stable than synthetic key typing for Chinese input.',
          action_type: 'hotkey',
          action_inputs: { key: 'ctrl+v' },
        },
        screenWidth,
        screenHeight,
        scaleFactor,
        prediction: 'Action: hotkey',
        factors: [1, 1] as [number, number],
      });
      return { inputMode: 'clipboard_ctrl_v' };
    }

    const request = {
      parsedPrediction: {
        thought: 'Execute audited desktop action from TaskSpec.',
        reflection: 'Desktop operator adapter forwards the action to NutJSOperator.',
        action_type: actionType,
        action_inputs: actionInputs,
      },
      screenWidth,
      screenHeight,
      scaleFactor,
      prediction: `Action: ${actionType}`,
      factors: [1, 1] as [number, number],
    };

    try {
      return await this.nutOperator.execute(request);
    } catch (error) {
      if (action.type !== 'type' || !action.content) {
        throw error;
      }

      // 中文输入失败时，用系统剪贴板兜底，再通过热键粘贴到已聚焦输入框。
      await setClipboardText(action.content);
      await this.nutOperator.execute({
        parsedPrediction: {
          thought: 'Paste audited text through clipboard fallback.',
          reflection: 'Fallback is used only after NutJS type fails.',
          action_type: 'hotkey',
          action_inputs: { key: 'ctrl+v' },
        },
        screenWidth,
        screenHeight,
        scaleFactor,
        prediction: 'Action: hotkey',
        factors: [1, 1] as [number, number],
      });

      const message = error instanceof Error ? error.message : String(error);
      return { fallback: 'clipboard_ctrl_v', originalError: message };
    }
  }
}

async function activateWindowByTitle(titles: string[]): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false;
  }

  const escapedTitles = titles.map((title) => title.replace(/'/g, "''"));
  const titleArray = `@(${escapedTitles.map((title) => `'${title}'`).join(',')})`;
  const script = [
    `$titles = ${titleArray}`,
    '$shell = New-Object -ComObject WScript.Shell',
    'foreach ($title in $titles) {',
    '  if ($shell.AppActivate($title)) { Write-Output "activated"; exit 0 }',
    '}',
    'exit 1',
  ].join('; ');

  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}

interface ProcessActivationOptions {
  processNames: string[];
  classNames: string[];
  titles: string[];
  executablePath?: string;
}

async function activateWindowByProcess(options: ProcessActivationOptions): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false;
  }

  const escapedNames = options.processNames.map((name) => name.replace(/'/g, "''"));
  const escapedClasses = options.classNames.map((name) => name.replace(/'/g, "''"));
  const escapedTitles = options.titles.map((title) => title.replace(/'/g, "''"));
  const escapedExecutablePath = options.executablePath?.replace(/'/g, "''");
  const nameArray = `@(${escapedNames.map((name) => `'${name}'`).join(',')})`;
  const classArray = `@(${escapedClasses.map((name) => `'${name}'`).join(',')})`;
  const titleArray = `@(${escapedTitles.map((title) => `'${title}'`).join(',')})`;
  const executablePathValue = escapedExecutablePath ? `'${escapedExecutablePath}'` : '$null';
  const script = [
    '$ErrorActionPreference = "SilentlyContinue"',
    `Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win32Focus {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@`,
    `$names = ${nameArray}`,
    `$classes = ${classArray}`,
    `$titles = ${titleArray}`,
    `$exe = ${executablePathValue}`,
    'function Find-FeishuWindow {',
    '$pids = Get-Process | Where-Object { $names -contains $_.ProcessName } | Select-Object -ExpandProperty Id',
    'if (-not $pids) { return [IntPtr]::Zero }',
    '$target = [IntPtr]::Zero',
    '$bestScore = -1',
    '$callback = [Win32Focus+EnumWindowsProc]{ param([IntPtr]$hwnd, [IntPtr]$lparam)',
    '  [uint32]$windowPid = 0',
    '  [void][Win32Focus]::GetWindowThreadProcessId($hwnd, [ref]$windowPid)',
    '  if ($pids -contains [int]$windowPid) {',
    '    $sb = New-Object System.Text.StringBuilder 512',
    '    [void][Win32Focus]::GetWindowText($hwnd, $sb, $sb.Capacity)',
    '    $classSb = New-Object System.Text.StringBuilder 256',
    '    [void][Win32Focus]::GetClassName($hwnd, $classSb, $classSb.Capacity)',
    '    $title = $sb.ToString()',
    '    $className = $classSb.ToString()',
    '    $visible = [Win32Focus]::IsWindowVisible($hwnd)',
    '    $rect = New-Object Win32Focus+RECT',
    '    [void][Win32Focus]::GetWindowRect($hwnd, [ref]$rect)',
    '    $width = $rect.Right - $rect.Left',
    '    $height = $rect.Bottom - $rect.Top',
    '    $offscreen = $rect.Left -lt -10000 -or $rect.Top -lt -10000',
    '    $score = 0',
    '    if ($visible) { $score += 10 }',
    '    if ($classes -contains $className) { $score += 50 }',
    '    if ($titles -contains $title) { $score += 100 }',
    '    if ($width -gt 500 -and $height -gt 300) { $score += 80 }',
    '    if ($offscreen -or $width -lt 300 -or $height -lt 200) { $score -= 200 }',
    '    if ($title -or $className -match "Chrome_WidgetWin") {',
    '      if ($score -gt $script:bestScore) {',
    '        $script:target = $hwnd',
    '        $script:bestScore = $score',
    '      }',
    '    }',
    '  }',
    '  return $true',
    '}',
    '[void][Win32Focus]::EnumWindows($callback, [IntPtr]::Zero)',
    'return $target',
    '}',
    '$target = Find-FeishuWindow',
    'if ($target -eq [IntPtr]::Zero -and $exe) { Start-Process -FilePath $exe; Start-Sleep -Milliseconds 1200; $target = Find-FeishuWindow }',
    'if ($target -eq [IntPtr]::Zero) { exit 1 }',
    '[void][Win32Focus]::ShowWindow($target, 9)',
    'Start-Sleep -Milliseconds 300',
    'if ([Win32Focus]::SetForegroundWindow($target)) { Write-Output "activated"; exit 0 }',
    '[void][Win32Focus]::ShowWindow($target, 5)',
    'Start-Sleep -Milliseconds 200',
    'if ([Win32Focus]::SetForegroundWindow($target)) { Write-Output "activated"; exit 0 }',
    'exit 1',
  ].join('; ');

  try {
    await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

function toNutActionType(action: OperatorAction): string {
  switch (action.type) {
    case 'click':
      return 'click';
    case 'double_click':
      return 'double_click';
    case 'right_click':
      return 'right_click';
    case 'type':
      return 'type';
    case 'hotkey':
      return 'hotkey';
    case 'scroll':
      return 'scroll';
    case 'finished':
      return 'finished';
    default:
      throw new Error(`Unsupported desktop action: ${action.type}`);
  }
}

function toNutActionInputs(
  action: OperatorAction,
  screenWidth: number,
  screenHeight: number,
): Record<string, string> {
  const inputs: Record<string, string> = {};
  if (action.startBox) inputs.start_box = action.startBox;
  else if (action.x !== undefined && action.y !== undefined) {
    const normalizedX = action.x / screenWidth;
    const normalizedY = action.y / screenHeight;
    inputs.start_box = `[${normalizedX},${normalizedY},${normalizedX},${normalizedY}]`;
  }
  if (action.content) inputs.content = action.content;
  if (action.key) inputs.key = action.key;
  if (action.direction) inputs.direction = action.direction;
  return inputs;
}

async function withCursorTelemetry(
  result: ExecuteResult,
  action: OperatorAction,
  screenWidth: number,
  screenHeight: number,
  cursorBeforeClick?: { x: number; y: number },
): Promise<ExecuteResult> {
  const cursorPosition = await readCursorPosition();
  const requestedPoint = getRequestedPoint(action, screenWidth, screenHeight);

  if (!cursorPosition) {
    return requestedPoint ? { ...result, requestedPoint, cursorBeforeClick } : result;
  }

  if (!requestedPoint) {
    return { ...result, cursorPosition, cursorBeforeClick };
  }

  return {
    ...result,
    cursorPosition,
    cursorBeforeClick,
    requestedPoint,
    cursorDelta: {
      dx: cursorPosition.x - requestedPoint.x,
      dy: cursorPosition.y - requestedPoint.y,
    },
    cursorBeforeClickDelta: cursorBeforeClick
      ? {
          dx: cursorBeforeClick.x - requestedPoint.x,
          dy: cursorBeforeClick.y - requestedPoint.y,
        }
      : undefined,
  };
}

async function readCursorPosition(): Promise<{ x: number; y: number } | undefined> {
  if (process.platform !== 'win32') {
    return undefined;
  }

  const script = [
    `Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CursorProbe {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")]
  public static extern bool GetCursorPos(out POINT lpPoint);
}
"@`,
    '$point = New-Object CursorProbe+POINT',
    'if ([CursorProbe]::GetCursorPos([ref]$point)) {',
    '  Write-Output ("{0},{1}" -f $point.X, $point.Y)',
    '  exit 0',
    '}',
    'exit 1',
  ].join('; ');

  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      timeout: 3000,
    });
    const [xRaw, yRaw] = stdout.trim().split(',');
    const x = Number(xRaw);
    const y = Number(yRaw);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      return { x, y };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function setClipboardText(content: string): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('Clipboard text fallback is only implemented on Windows.');
  }

  const encoded = Buffer.from(content, 'utf16le').toString('base64');
  const script = [
    `$bytes = [Convert]::FromBase64String('${encoded}')`,
    '$text = [System.Text.Encoding]::Unicode.GetString($bytes)',
    'Set-Clipboard -Value $text',
  ].join('; ');

  await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    windowsHide: true,
    timeout: 3000,
  });
}

function hasNonAscii(content: string): boolean {
  return /[^\x00-\x7F]/.test(content);
}

function getRequestedPoint(
  action: OperatorAction,
  screenWidth: number,
  screenHeight: number,
): { x: number; y: number } | undefined {
  if (!['click', 'double_click', 'right_click'].includes(action.type)) {
    return undefined;
  }

  if (action.x !== undefined && action.y !== undefined) {
    return { x: action.x, y: action.y };
  }

  if (!action.startBox) {
    return undefined;
  }

  const match = action.startBox.match(/^\s*\[\s*([-.\d]+)\s*,\s*([-.\d]+)\s*,\s*([-.\d]+)\s*,\s*([-.\d]+)\s*\]\s*$/);
  if (!match) {
    return undefined;
  }

  const [, x1Raw, y1Raw, x2Raw, y2Raw] = match;
  const x1 = Number(x1Raw);
  const y1 = Number(y1Raw);
  const x2 = Number(x2Raw);
  const y2 = Number(y2Raw);
  if (![x1, y1, x2, y2].every(Number.isFinite)) {
    return undefined;
  }

  return {
    x: Math.round(((x1 + x2) / 2) * screenWidth),
    y: Math.round(((y1 + y2) / 2) * screenHeight),
  };
}

function readPngDimensions(base64: string): { width?: number; height?: number } {
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 24) {
    return {};
  }

  const pngSignature = '89504e470d0a1a0a';
  if (bytes.subarray(0, 8).toString('hex') !== pngSignature) {
    return {};
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

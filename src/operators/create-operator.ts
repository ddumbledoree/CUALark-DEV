import { FeishuDesktopOperator } from './feishu-desktop-operator.js';
import { MockOperator } from './mock-operator.js';
import type { CuaOperator } from './operator.js';

export function createOperator(name = 'mock'): CuaOperator {
  switch (name) {
    case 'mock':
      return new MockOperator();
    case 'feishu-desktop':
      return new FeishuDesktopOperator({
        screenWidth: readNumberEnv('CUA_SCREEN_WIDTH'),
        screenHeight: readNumberEnv('CUA_SCREEN_HEIGHT'),
        focusMode: readFocusMode(),
        focusWindowTitles: readListEnv('CUA_FEISHU_WINDOW_TITLES') ?? ['飞书', 'Feishu', 'Lark'],
        focusProcessNames: readListEnv('CUA_FEISHU_PROCESS_NAMES') ?? ['Feishu', 'Lark'],
        focusClassNames: readListEnv('CUA_FEISHU_CLASS_NAMES') ?? ['Chrome_WidgetWin_1'],
        focusExecutablePath: process.env.CUA_FEISHU_EXE,
        focusStartBox: process.env.CUA_FEISHU_FOCUS_BOX,
        postActionDelayMs: readNumberEnv('CUA_POST_ACTION_DELAY_MS'),
      });
    default:
      throw new Error(`Operator ${name} is not wired. Use CUA_OPERATOR=mock or feishu-desktop.`);
  }
}

function readNumberEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number, got: ${raw}`);
  }

  return value;
}

function readListEnv(name: string): string[] | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length ? values : undefined;
}

function readFocusMode(): 'app-activate' | 'taskbar' {
  const raw = process.env.CUA_FEISHU_FOCUS_MODE ?? 'app-activate';
  if (raw === 'app-activate' || raw === 'taskbar') {
    return raw;
  }

  throw new Error(`CUA_FEISHU_FOCUS_MODE must be app-activate or taskbar, got: ${raw}`);
}

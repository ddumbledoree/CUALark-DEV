export interface ScreenshotResult {
  base64: string;
  scaleFactor: number;
  width?: number;
  height?: number;
}

export type OperatorActionType =
  | 'screenshot'
  | 'note'
  | 'click'
  | 'double_click'
  | 'right_click'
  | 'type'
  | 'hotkey'
  | 'scroll'
  | 'wait'
  | 'finished';

export interface OperatorAction {
  type: OperatorActionType;
  note?: string;
  startBox?: string;
  x?: number;
  y?: number;
  content?: string;
  key?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  waitMs?: number;
}

export interface ExecuteResult {
  status: 'success' | 'end' | 'skipped';
  message?: string;
  action?: OperatorAction;
  cursorPosition?: {
    x: number;
    y: number;
  };
  cursorBeforeClick?: {
    x: number;
    y: number;
  };
  requestedPoint?: {
    x: number;
    y: number;
  };
  cursorDelta?: {
    dx: number;
    dy: number;
  };
  cursorBeforeClickDelta?: {
    dx: number;
    dy: number;
  };
}

export interface OperatorOptions {
  screenWidth?: number;
  screenHeight?: number;
  focusMode?: 'app-activate' | 'taskbar';
  focusWindowTitles?: string[];
  focusProcessNames?: string[];
  focusClassNames?: string[];
  focusExecutablePath?: string;
  focusStartBox?: string;
  postActionDelayMs?: number;
}

export interface CuaOperator {
  name: string;
  screenshot(): Promise<ScreenshotResult>;
  execute(action: OperatorAction): Promise<ExecuteResult>;
  moveMouse?(x: number, y: number): Promise<void>;
}

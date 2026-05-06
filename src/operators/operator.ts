export interface ScreenshotResult {
  base64: string;
  scaleFactor: number;
}

export interface OperatorAction {
  type: 'screenshot' | 'note';
  note?: string;
}

export interface CuaOperator {
  name: string;
  screenshot(): Promise<ScreenshotResult>;
  execute(action: OperatorAction): Promise<void>;
}

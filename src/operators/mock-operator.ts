import type { CuaOperator, ExecuteResult, OperatorAction, ScreenshotResult } from './operator.js';
import { createSolidPngBase64 } from '../utils/png.js';

export class MockOperator implements CuaOperator {
  readonly name = 'mock';

  async screenshot(): Promise<ScreenshotResult> {
    // Phase 1 mock 截图用于验证 Agent Core 与 trace 管线，不触碰真实桌面。
    return {
      base64: createSolidPngBase64(32, 32, [64, 120, 255, 255]),
      scaleFactor: 1,
      width: 32,
      height: 32,
    };
  }

  async execute(action: OperatorAction): Promise<ExecuteResult> {
    // mock operator 接受完整动作集合，用于验证核心管线而不触碰真实桌面。
    if (action.type === 'finished') {
      return { status: 'end', action, cursorPosition: { x: 0, y: 0 } };
    }

    return {
      status: 'skipped',
      action,
      message: 'mock operator skipped desktop action',
      cursorPosition: { x: 0, y: 0 },
    };
  }
}

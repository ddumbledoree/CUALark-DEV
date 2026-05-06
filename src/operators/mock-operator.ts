import type { CuaOperator, OperatorAction, ScreenshotResult } from './operator.js';

export class MockOperator implements CuaOperator {
  readonly name = 'mock';

  async screenshot(): Promise<ScreenshotResult> {
    // Phase 1 mock 截图用于验证 Agent Core 与 trace 管线，不触碰真实桌面。
    return {
      base64: Buffer.from('mock-screenshot').toString('base64'),
      scaleFactor: 1,
    };
  }

  async execute(action: OperatorAction): Promise<void> {
    if (action.type === 'note') {
      return;
    }

    if (action.type === 'screenshot') {
      return;
    }

    const exhaustive: never = action.type;
    throw new Error(`Unsupported mock action: ${exhaustive}`);
  }
}

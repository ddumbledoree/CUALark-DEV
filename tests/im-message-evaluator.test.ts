import assert from 'node:assert/strict';

import { evaluateImMessageWithLarkCli } from '../src/evaluators/im-message-evaluator.js';
import type { LarkCliClient, LarkCliRunResult } from '../src/evaluators/lark-cli-client.js';
import type { TaskSpec } from '../src/core/task-spec.js';

const task: TaskSpec = {
  id: 'im-api-eval-smoke',
  title: 'IM API evaluator smoke',
  targetProduct: 'im',
  instruction: 'Verify a known test message through lark-cli output.',
  initialState: 'Read-only evaluator smoke.',
  expectedResult: 'Expected message text is present in lark-cli output.',
  safety: {
    allowedChats: ['CUA test chat'],
    allowedUsers: [],
    forbidDelete: true,
  },
  evaluator: {
    type: 'feishu_im_message_check',
    expectedText: 'CUA-Lark evaluator smoke',
    larkCliArgs: ['api', 'GET', '/open-apis/im/v1/messages'],
    timeoutMs: 1000,
    pollIntervalMs: 10,
    chatName: 'CUA test chat',
  },
};

const passingClient: LarkCliClient = {
  async run(args: string[]): Promise<LarkCliRunResult> {
    assert.deepEqual(args.at(-2), '--format');
    assert.deepEqual(args.at(-1), 'json');
    return {
      ok: true,
      stdoutText: JSON.stringify({
        data: {
          items: [
            {
              body: {
                content: 'CUA-Lark evaluator smoke',
              },
            },
          ],
        },
      }),
      stdoutJson: {
        data: {
          items: [
            {
              body: {
                content: 'CUA-Lark evaluator smoke',
              },
            },
          ],
        },
      },
      stderrText: '',
      exitCode: 0,
    };
  },
};

const missingClient: LarkCliClient = {
  async run(): Promise<LarkCliRunResult> {
    return {
      ok: true,
      stdoutText: JSON.stringify({ data: { items: [] } }),
      stdoutJson: { data: { items: [] } },
      stderrText: '',
      exitCode: 0,
    };
  },
};

const passed = await evaluateImMessageWithLarkCli(task, passingClient);
assert.equal(passed.passed, true);
assert.equal(passed.evidence?.expectedText, 'CUA-Lark evaluator smoke');
assert.equal(passed.evidence?.chatName, 'CUA test chat');

const failed = await evaluateImMessageWithLarkCli(task, missingClient);
assert.equal(failed.passed, false);
assert.match(failed.reason, /expected message text was not found/);

console.log('IM message evaluator smoke test passed');

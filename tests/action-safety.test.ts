import assert from 'node:assert/strict';

import { checkActionSafety } from '../src/core/action-safety.js';
import type { TaskSpec } from '../src/core/task-spec.js';

const searchOnlyTask: TaskSpec = {
  id: 'safety-search-test',
  title: 'safety search test',
  targetProduct: 'im',
  instruction: 'search only',
  initialState: 'test',
  expectedResult: 'test',
  safety: {
    allowedChats: ['CUA测试群'],
    allowedUsers: [],
    forbidDelete: true,
  },
  evaluator: {
    type: 'manual',
    checklist: [],
  },
};

assert.equal(checkActionSafety(searchOnlyTask, { type: 'type', content: 'CUA测试群' }).allowed, true);
assert.equal(checkActionSafety(searchOnlyTask, { type: 'type', content: 'CUA测试群\\n' }).allowed, false);
assert.equal(checkActionSafety(searchOnlyTask, { type: 'type', content: '其他群' }).allowed, false);
assert.equal(checkActionSafety(searchOnlyTask, { type: 'type', content: '发送真实消息' }).allowed, false);
assert.equal(checkActionSafety(searchOnlyTask, { type: 'click' }).allowed, false);
assert.equal(checkActionSafety(searchOnlyTask, { type: 'click', x: 30, y: 76 }).allowed, true);
assert.equal(checkActionSafety(searchOnlyTask, { type: 'hotkey', key: 'enter' }).allowed, false);
assert.equal(checkActionSafety(searchOnlyTask, { type: 'hotkey', key: 'ctrl+k' }).allowed, true);
assert.equal(checkActionSafety(searchOnlyTask, { type: 'hotkey', key: 'backspace' }).allowed, false);

const sendTask: TaskSpec = {
  ...searchOnlyTask,
  id: 'safety-send-test',
  instruction: 'send Hello world!',
  safety: {
    allowedChats: ['CUA测试群'],
    allowedUsers: [],
    allowedMessageTexts: ['Hello world!'],
    allowSend: true,
    forbidDelete: true,
  },
};

assert.equal(checkActionSafety(sendTask, { type: 'type', content: 'Hello world!' }).allowed, true);
assert.equal(checkActionSafety(sendTask, { type: 'type', content: 'Other message' }).allowed, false);
assert.equal(checkActionSafety(sendTask, { type: 'hotkey', key: 'enter' }).allowed, true);

console.log('action safety smoke test passed');

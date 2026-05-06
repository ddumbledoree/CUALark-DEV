import assert from 'node:assert/strict';

import { loadTaskSpec } from '../src/core/load-task.js';

const task = await loadTaskSpec('tasks/im-send-text-001.mock.json');

assert.equal(task.id, 'im-send-text-001');
assert.equal(task.targetProduct, 'im');
assert.ok(task.safety.allowedChats?.includes('CUA测试群'));
assert.equal(task.safety.forbidDelete, true);

console.log('loadTaskSpec smoke test passed');

import assert from 'node:assert/strict';

import { loadTaskSpec } from '../src/core/load-task.js';

const task = await loadTaskSpec('tasks/im-send-text-001.mock.json');

assert.equal(task.id, 'im-send-text-001');
assert.equal(task.targetProduct, 'im');
assert.ok(task.safety.allowedChats?.length);
assert.equal(task.safety.forbidDelete, true);

const calendarTask = await loadTaskSpec('tasks/calendar-api-eval.example.json');
assert.equal(calendarTask.targetProduct, 'calendar');
assert.ok(calendarTask.safety.allowedCalendars?.includes('CUA-test-calendar'));
assert.equal(calendarTask.evaluator.type, 'feishu_calendar_event_check');

console.log('loadTaskSpec smoke test passed');

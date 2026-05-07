import assert from 'node:assert/strict';

import type { TaskSpec } from '../src/core/task-spec.js';
import { evaluateCalendarEventWithLarkCli } from '../src/evaluators/calendar-event-evaluator.js';
import type { LarkCliClient, LarkCliRunResult } from '../src/evaluators/lark-cli-client.js';

const task: TaskSpec = {
  id: 'calendar-api-eval-smoke',
  title: 'Calendar API evaluator smoke',
  targetProduct: 'calendar',
  instruction: 'Verify a known test calendar event through lark-cli output.',
  initialState: 'Read-only evaluator smoke.',
  expectedResult: 'Expected calendar event fields are present in lark-cli output.',
  safety: {
    allowedCalendars: ['CUA test calendar'],
    allowedUsers: [],
    forbidDelete: true,
  },
  evaluator: {
    type: 'feishu_calendar_event_check',
    expectedTitle: 'CUA-Lark calendar evaluator smoke',
    expectedStartText: '2026-05-07T10:00',
    expectedAttendee: 'cua-test-user-a',
    larkCliArgs: ['api', 'GET', '/open-apis/calendar/v4/calendars/primary/events'],
    timeoutMs: 1000,
    pollIntervalMs: 10,
    calendarName: 'CUA test calendar',
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
              summary: 'CUA-Lark calendar evaluator smoke',
              start_time: '2026-05-07T10:00',
              attendees: [{ user_id: 'cua-test-user-a' }],
            },
          ],
        },
      }),
      stdoutJson: {
        data: {
          items: [
            {
              summary: 'CUA-Lark calendar evaluator smoke',
              start_time: '2026-05-07T10:00',
              attendees: [{ user_id: 'cua-test-user-a' }],
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

const passed = await evaluateCalendarEventWithLarkCli(task, passingClient);
assert.equal(passed.passed, true);
assert.equal(passed.evidence?.expectedTitle, 'CUA-Lark calendar evaluator smoke');
assert.equal(passed.evidence?.calendarName, 'CUA test calendar');

const failed = await evaluateCalendarEventWithLarkCli(task, missingClient);
assert.equal(failed.passed, false);
assert.match(failed.reason, /expected calendar event fields were not found/);

console.log('Calendar event evaluator smoke test passed');

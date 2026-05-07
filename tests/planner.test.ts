import { createPlanner } from '../src/core/planner.js';
import type { TaskSpec } from '../src/core/task-spec.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const baseTask: TaskSpec = {
  id: 'test-task',
  title: 'Test',
  targetProduct: 'im',
  instruction: 'Search for CUA-test-chat',
  initialState: 'Feishu open',
  expectedResult: 'Chat opened',
  safety: { allowedChats: ['CUA-test-chat'], forbidDelete: true },
  evaluator: { type: 'mock', expectedStatus: 'passed' },
};

// Test 1: TaskSpec with steps field → direct mapping
{
  const task: TaskSpec = {
    ...baseTask,
    steps: [
      { action: 'locate_and_click', targetDescription: '搜索框' },
      { action: 'locate_and_type', targetDescription: '搜索输入框', typeContent: 'CUA-test-chat' },
      { action: 'wait', waitMs: 500 },
    ],
    actions: [
      { type: 'click', x: 100, y: 200 },
      { type: 'type', content: 'CUA-test-chat' },
      { type: 'wait', waitMs: 500 },
    ],
  };
  const planner = createPlanner(task);
  const steps = planner.plan();
  assertEqual(steps.length, 3, 'test1.length');
  assertEqual(steps[0].action, 'locate_and_click', 'test1.step0.action');
  assertEqual(steps[0].targetDescription, '搜索框', 'test1.step0.description');
  assertEqual(steps[0].fallbackAction?.type, 'click', 'test1.step0.fallback');
  assertEqual(steps[1].typeContent, 'CUA-test-chat', 'test1.step1.typeContent');
  assertEqual(steps[1].fallbackAction?.type, 'type', 'test1.step1.fallback');
  assertEqual(steps[2].waitMs, 500, 'test1.step2.waitMs');
  passed++;
  console.log('PASS: test 1 - steps field direct mapping');
}

// Test 2: IM + "搜索" instruction → IM search steps
{
  const task: TaskSpec = {
    ...baseTask,
    targetProduct: 'im',
    instruction: '搜索 CUA-test-chat',
  };
  const steps = createPlanner(task).plan();
  assert(steps.length >= 4, 'test2 should have >= 4 steps');
  assertEqual(steps[0].action, 'locate_and_click', 'test2.step0.action');
  assertEqual(steps[0].targetDescription, '飞书左上方搜索框', 'test2.step0.desc');
  assertEqual(steps[1].action, 'hotkey', 'test2.step1.action');
  assertEqual(steps[1].hotkey, 'ctrl+a', 'test2.step1.hotkey');
  assertEqual(steps[2].action, 'locate_and_type', 'test2.step2.action');
  assertEqual(steps[2].typeContent, 'CUA-test-chat', 'test2.step2.content');
  passed++;
  console.log('PASS: test 2 - IM search instruction');
}

// Test 3: Calendar + "打开" instruction → calendar open steps
{
  const task: TaskSpec = {
    ...baseTask,
    targetProduct: 'calendar',
    instruction: '打开日历页面',
    safety: { allowedCalendars: ['CUA-test-calendar'], forbidDelete: true },
  };
  const steps = createPlanner(task).plan();
  assertEqual(steps.length, 2, 'test3.length');
  assertEqual(steps[0].action, 'locate_and_click', 'test3.step0.action');
  assertEqual(steps[0].targetDescription, '左侧导航日历图标', 'test3.step0.desc');
  assertEqual(steps[1].action, 'wait', 'test3.step1.action');
  assertEqual(steps[1].waitMs, 1500, 'test3.step1.waitMs');
  passed++;
  console.log('PASS: test 3 - Calendar open instruction');
}

// Test 4: Only actions, no steps → fallback from actions
{
  const task: TaskSpec = {
    ...baseTask,
    targetProduct: 'docs',
    instruction: 'Open a document and verify the title',
    safety: { forbidDelete: true },
    actions: [
      { type: 'click', x: 100, y: 200 },
      { type: 'type', content: 'hello' },
      { type: 'wait', waitMs: 500 },
      { type: 'hotkey', key: 'ctrl+a' },
    ],
  };
  const steps = createPlanner(task).plan();
  assertEqual(steps.length, 4, 'test4.length');
  assertEqual(steps[0].action, 'locate_and_click', 'test4.step0.action');
  assertEqual(steps[0].fallbackAction?.x, 100, 'test4.step0.fallback.x');
  assertEqual(steps[1].action, 'locate_and_type', 'test4.step1.action');
  assertEqual(steps[1].typeContent, 'hello', 'test4.step1.content');
  assertEqual(steps[2].action, 'wait', 'test4.step2.action');
  assertEqual(steps[3].action, 'hotkey', 'test4.step3.action');
  assertEqual(steps[3].hotkey, 'ctrl+a', 'test4.step3.hotkey');
  passed++;
  console.log('PASS: test 4 - actions-only fallback');
}

console.log(`\nplanner tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}

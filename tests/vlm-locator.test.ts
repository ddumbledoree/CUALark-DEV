import { parseLocateResponse } from '../src/models/vlm-locator.js';

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

// Test 1: Normal found response
{
  const result = parseLocateResponse(
    '{"found":true,"x":345,"y":267,"confidence":0.9,"reason":"搜索框"}',
    150,
  );
  assertEqual(result.found, true, 'test1.found');
  assertEqual(result.x, 345, 'test1.x');
  assertEqual(result.y, 267, 'test1.y');
  assertEqual(result.confidence, 0.9, 'test1.confidence');
  assertEqual(result.reason, '搜索框', 'test1.reason');
  assertEqual(result.source, 'vlm', 'test1.source');
  assertEqual(result.latencyMs, 150, 'test1.latencyMs');
  passed++;
  console.log('PASS: test 1 - normal found response');
}

// Test 2: Not found response
{
  const result = parseLocateResponse(
    '{"found":false,"x":0,"y":0,"confidence":0,"reason":"看不到搜索框"}',
    80,
  );
  assertEqual(result.found, false, 'test2.found');
  assertEqual(result.confidence, 0, 'test2.confidence');
  assertEqual(result.reason, '看不到搜索框', 'test2.reason');
  passed++;
  console.log('PASS: test 2 - not found response');
}

// Test 3: Response with ```json``` fence
{
  const result = parseLocateResponse(
    '```json\n{"found":true,"x":100,"y":200,"confidence":0.8,"reason":"按钮"}\n```',
    200,
  );
  assertEqual(result.found, true, 'test3.found');
  assertEqual(result.x, 100, 'test3.x');
  assertEqual(result.y, 200, 'test3.y');
  assertEqual(result.confidence, 0.8, 'test3.confidence');
  passed++;
  console.log('PASS: test 3 - fenced json response');
}

// Test 4: Confidence clamped to [0, 1]
{
  const resultHigh = parseLocateResponse(
    '{"found":true,"x":50,"y":50,"confidence":1.5,"reason":"test"}',
    50,
  );
  assertEqual(resultHigh.confidence, 1, 'test4.high.confidence');

  const resultLow = parseLocateResponse(
    '{"found":true,"x":50,"y":50,"confidence":-0.3,"reason":"test"}',
    50,
  );
  assertEqual(resultLow.confidence, 0, 'test4.low.confidence');
  passed++;
  console.log('PASS: test 4 - confidence clamped');
}

// Test 5: Missing x/y fields when found=true throws
{
  let threw = false;
  try {
    parseLocateResponse('{"found":true,"confidence":0.5,"reason":"no coords"}', 50);
  } catch {
    threw = true;
  }
  assert(threw, 'test5 should throw on missing x/y');
  passed++;
  console.log('PASS: test 5 - missing x/y throws');
}

// Test 6: Usage passed through
{
  const result = parseLocateResponse(
    '{"found":true,"x":10,"y":20,"confidence":0.7,"reason":"test"}',
    100,
    { usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } },
  );
  assertEqual(result.usage?.totalTokens, 150, 'test6.usage.totalTokens');
  passed++;
  console.log('PASS: test 6 - usage passed through');
}

console.log(`\nvlm-locator tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}

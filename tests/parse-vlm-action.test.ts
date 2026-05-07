import assert from 'node:assert/strict';

import { parseVlmAction } from '../src/models/parse-vlm-action.js';

const fenced = parseVlmAction('```json\n{"type":"click","start_box":"[0.1,0.2,0.1,0.2]"}\n```');
assert.deepEqual(fenced.action, {
  type: 'click',
  startBox: '[0.1,0.2,0.1,0.2]',
});

const wait = parseVlmAction('{"type":"wait","waitMs":500}');
assert.deepEqual(wait.action, {
  type: 'wait',
  waitMs: 500,
});

const point = parseVlmAction('{"type":"click","position":[30,76]}');
assert.deepEqual(point.action, {
  type: 'click',
  x: 30,
  y: 76,
});

const xy = parseVlmAction('{"type":"click","x":27,"y":77}');
assert.deepEqual(xy.action, {
  type: 'click',
  x: 27,
  y: 77,
});

assert.throws(() => parseVlmAction('{"type":"delete"}'), /Unsupported VLM action type/);

console.log('parseVlmAction smoke test passed');

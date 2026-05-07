const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('Usage: node parse-trace.cjs <steps.jsonl>'); process.exit(1); }
const lines = fs.readFileSync(path, 'utf8').trim().split('\n');
for (const line of lines) {
  const step = JSON.parse(line);
  const ts = step.timestamp || '';
  const type = step.type || '';
  if (type === 'step.execute') {
    const action = step.action || {};
    const status = step.executeStatus || '';
    const parts = [`[${ts}] ${type} action=${action.type || action.action || '?'} status=${status}`];
    if (action.x !== undefined) parts.push(`  coords=(${action.x}, ${action.y})`);
    if (action.typeContent) parts.push(`  content="${action.typeContent}"`);
    if (step.cursorPosition) parts.push(`  cursor=(${step.cursorPosition.x}, ${step.cursorPosition.y})`);
    if (step.requestedPoint) parts.push(`  requested=(${step.requestedPoint.x}, ${step.requestedPoint.y})`);
    if (step.cursorDelta) parts.push(`  delta=(dx=${step.cursorDelta.dx}, dy=${step.cursorDelta.dy})`);
    console.log(parts.join('\n'));
  } else if (type === 'step.locate') {
    console.log(`[${ts}] ${type} source=${step.source || ''} confidence=${step.confidence ?? ''} coords=(${step.x ?? ''}, ${step.y ?? ''})`);
    if (step.reason) console.log(`  reason=${step.reason.substring(0, 120)}`);
  } else if (type === 'step.safety') {
    console.log(`[${ts}] ${type} allowed=${step.allowed} reason=${step.reason || ''}`);
  } else if (type === 'step.state_verify') {
    console.log(`[${ts}] ${type} passed=${step.passed} reason=${(step.reason || '').substring(0, 100)}`);
  } else if (type === 'step.evaluator') {
    console.log(`[${ts}] ${type} status=${step.evalStatus || ''} reason=${(step.evalReason || '').substring(0, 100)}`);
  } else {
    console.log(`[${ts}] ${type} ${step.message || ''}`);
  }
}

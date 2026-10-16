import assert from 'node:assert/strict';
import test from 'node:test';
import { terminalTrace } from './sandbox.js';

test('terminal trace reports only process-boundary facts for native adapters', () => {
  const events = terminalTrace('native-run', 'cpp', ['answer: 42'], true);
  assert.deepEqual(events.map((event) => event.type), ['program_start', 'program_output', 'program_finish']);
  assert.equal(events[1].detail, 'answer: 42');
  assert.deepEqual(events[1].snapshot.globals, {});
  assert.deepEqual(events[1].snapshot.frames, []);
});

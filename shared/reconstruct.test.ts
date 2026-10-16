import assert from 'node:assert/strict';
import test from 'node:test';
import { stateAt } from './reconstruct';
import type { ExecutionEvent } from './schema';

const event: ExecutionEvent = {
  id: 'event-1', executionId: 'run-1', sequence: 1, type: 'variable_assignment', observed: true,
  source: { file: 'main.js', line: 2, column: 0 }, changes: [], snapshot: { globals: { index: 2 }, frames: [], output: [] },
};

test('state reconstruction returns a copy without re-executing code', () => {
  const state = stateAt([event], 0)!;
  state.globals.index = 99;
  assert.equal(event.snapshot.globals.index, 2);
  assert.equal(stateAt([event], 2), undefined);
});

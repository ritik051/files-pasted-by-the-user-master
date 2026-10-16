import assert from 'node:assert/strict';
import test from 'node:test';
import { planScene } from './registry.js';

test('scene registry activates only trace-backed pointer markers', () => {
  const plan = planScene({ globals: { values: [3, 7, 12], left: 0, middle: 1, right: 2, target: 7 }, frames: [], output: [] });
  assert.deepEqual(plan.modules, ['variables', 'call-stack', 'array', 'search-pointers']);
  assert.deepEqual(plan.array?.pointers.map((pointer) => `${pointer.name}:${pointer.index}`), ['left:0', 'middle:1', 'right:2']);
});

test('scene registry does not assign pointer roles to unrelated values', () => {
  const plan = planScene({ globals: { values: [3, 7], target: 7, count: 1 }, frames: [], output: [] });
  assert.deepEqual(plan.modules, ['variables', 'call-stack', 'array']);
});

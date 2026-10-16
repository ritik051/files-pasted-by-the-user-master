import assert from 'node:assert/strict';
import test from 'node:test';
import { instrumentJavaScript, UnsupportedJavaScriptFeature } from './instrument-javascript.js';

test('JavaScript instrumentation adds trace boundaries while retaining source line calls', () => {
  const result = instrumentJavaScript('const values = [1, 2];\nvalues.push(3);\nconsole.log(values.length);');
  assert.match(result, /__trace\.start\(\)/);
  assert.match(result, /__trace\.line\(1, "declaration"/);
  assert.match(result, /__trace\.line\(2, "mutation"/);
});

test('JavaScript instrumentation declines asynchronous execution rather than claiming a trace', () => {
  assert.throws(() => instrumentJavaScript('async function run() { await Promise.resolve(1); }'), UnsupportedJavaScriptFeature);
});

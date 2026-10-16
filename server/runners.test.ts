import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { instrumentJavaScript } from './instrument-javascript.js';
import { nodeRunner, pythonRunner } from './runners.js';

function environment(source: string) {
  return { ...process.env, SOURCE_B64: Buffer.from(source).toString('base64'), INPUT_B64: '', TRACE_LIMIT: '100' };
}

test('Node trace runner records the observed return value and output', () => {
  const source = instrumentJavaScript('function twice(n) { const result = n * 2; return result; } const value = twice(4); console.log(value);');
  const run = spawnSync('node', ['-e', nodeRunner], { encoding: 'utf8', env: environment(source), timeout: 3_000 });
  assert.equal(run.status, 0, run.stderr);
  const trace = JSON.parse(run.stdout) as { events: Array<{ type: string; returnValue?: unknown }>; output: string[] };
  assert.equal(trace.events.find((event) => event.type === 'function_return')?.returnValue, 8);
  assert.deepEqual(trace.output, ['8']);
});

test('Python trace runner records output from the executed program', () => {
  const source = 'def add(a, b):\n    return a + b\nresult = add(2, 3)\nprint(result)';
  const run = spawnSync('python3', ['-c', pythonRunner], { encoding: 'utf8', env: environment(source), timeout: 3_000 });
  assert.equal(run.status, 0, run.stderr);
  const trace = JSON.parse(run.stdout) as { events: Array<{ type: string }>; output: string[] };
  assert.ok(trace.events.some((event) => event.type === 'function_return'));
  assert.deepEqual(trace.output, ['5']);
});

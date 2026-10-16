import assert from 'node:assert/strict';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';
import { instrumentJavaScript } from '../../server/instrument-javascript.js';
import { browserTraceRunner } from './browser-trace.js';

test('browser worker runner emits an observed JavaScript trace without a server sandbox', () => {
  const messages: unknown[] = [];
  const context = createContext({
    postMessage: (message: unknown) => messages.push(message),
  });
  (context as { globalThis: object }).globalThis = context;
  runInContext(browserTraceRunner, context);
  const worker = context as { onmessage: (event: { data: { source: string; input: string; maxEvents: number } }) => void };
  worker.onmessage({ data: {
    source: instrumentJavaScript(['const values = [1, 2];', 'values.push(3);', 'console.log(values.length);'].join('\n')),
    input: '', maxEvents: 50,
  } });
  const result = messages[0] as { events: Array<{ type: string }>; output: string[] };
  assert.deepEqual(Array.from(result.output), ['3']);
  assert.ok(result.events.some((event) => event.type === 'array_mutation'));
  assert.equal(result.events.at(-1)?.type, 'program_finish');
});

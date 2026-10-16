import assert from 'node:assert/strict';
import test from 'node:test';
import type { Execution } from '../shared/schema.js';
import { resolveTeacherProvider } from './teacher-provider.js';

const execution: Execution = {
  id: 'run-1', sourceVersionId: 'source-1', language: 'javascript', source: 'const count = 1;', input: '', status: 'complete', startedAt: '', finishedAt: '', output: [],
  events: [{ id: 'event-0', executionId: 'run-1', sequence: 0, type: 'variable_declaration', observed: true, source: { file: 'main.js', line: 1, column: 0 }, changes: [{ path: 'count', after: 1, kind: 'declaration' }], snapshot: { globals: { count: 1 }, frames: [], output: [] } }],
};

test('default teacher provider creates event-grounded narration', () => {
  const provider = resolveTeacherProvider('trace-grounded');
  const lesson = provider.buildLesson(execution);
  assert.equal(provider.id, 'trace-grounded');
  assert.deepEqual(lesson.segments[0].evidence, ['event-0']);
});

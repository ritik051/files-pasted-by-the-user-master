import type { Execution, ExecutionEvent } from '../../shared/schema';

const MAX_EVENTS = 500;
const TIMEOUT_MS = 2_000;

type WorkerResult = {
  events: Omit<ExecutionEvent, 'executionId'>[];
  output: string[];
};

export const browserTraceRunner = String.raw`
const send = postMessage.bind(globalThis);
onmessage = ({ data }) => {
  const globalThis = undefined;
  const self = undefined;
  const fetch = undefined;
  const XMLHttpRequest = undefined;
  const WebSocket = undefined;
  const importScripts = undefined;
  const source = data.source;
  const input = data.input;
  const maxEvents = data.maxEvents;
  const events = [];
  const output = [];
  const stack = [];
  let sequence = 0;
  let frameCounter = 0;
  let previous = {};
  let traceGlobals = {};
  const clean = (value, seen = new WeakSet(), depth = 0) => {
    if (value === undefined) return { $undefined: true };
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (typeof value === 'bigint') return String(value) + 'n';
    if (typeof value === 'function') return '[Function]';
    if (typeof value === 'symbol') return String(value);
    if (depth > 4) return '[Depth limit]';
    if (typeof value === 'object') {
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
      if (Array.isArray(value)) return value.slice(0, 60).map((item) => clean(item, seen, depth + 1));
      const result = {};
      for (const key of Object.keys(value).slice(0, 60)) {
        try { result[key] = clean(value[key], seen, depth + 1); } catch { result[key] = '[Unreadable]'; }
      }
      return result;
    }
    return String(value);
  };
  const same = (first, second) => JSON.stringify(first) === JSON.stringify(second);
  const snapshot = (getter) => {
    let locals = {};
    try { locals = clean(getter ? getter() : {}); } catch { locals = {}; }
    if (!locals || Array.isArray(locals) || typeof locals !== 'object') locals = {};
    if (stack.length) stack[stack.length - 1].locals = locals;
    else traceGlobals = locals;
    return { globals: clean(traceGlobals), frames: clean(stack), output: [...output] };
  };
  const record = (type, line, getter, extra = {}) => {
    if (events.length >= maxEvents) throw new Error('TRACE_LIMIT');
    const state = snapshot(getter);
    const visible = { ...state.globals, ...(state.frames.length ? state.frames[state.frames.length - 1].locals : {}) };
    const changes = [];
    for (const key of new Set([...Object.keys(previous), ...Object.keys(visible)])) {
      if (!same(previous[key], visible[key])) changes.push({ path: key, before: previous[key], after: visible[key], kind: previous[key] === undefined ? 'declaration' : extra.kind === 'mutation' ? 'mutation' : 'assignment' });
    }
    previous = clean(visible);
    const frame = stack.length ? stack[stack.length - 1] : undefined;
    const event = { id: 'event-' + sequence, sequence: sequence++, type, observed: true, changes: changes.slice(0, 40), snapshot: state, ...extra };
    if (line) event.source = { file: 'main.js', line, column: 0 };
    if (frame) event.frame = { id: frame.id, parentId: frame.parentId, functionName: frame.functionName };
    events.push(event);
  };
  const trace = {
    start() { record('program_start', 1, () => ({})); },
    line(line, kind, getter) { const types = { declaration: 'variable_declaration', assignment: 'variable_assignment', mutation: 'array_mutation', loop: 'loop_iteration', line: 'line_execution' }; record(types[kind] || 'line_execution', line, getter, { kind }); },
    condition(line, test, getter) { const result = Boolean(test()); record('conditional_evaluation', line, getter, { condition: result }); return result; },
    call(line, name, args, getter) { const parent = stack.length ? stack[stack.length - 1].id : null; const frame = { id: 'frame-' + (++frameCounter), parentId: parent, functionName: name, line, locals: {}, arguments: clean(args()) }; stack.push(frame); record('function_call', line, getter, { detail: 'Called ' + name }); },
    returnValue(line, value, getter) { const result = value(); record('function_return', line, getter, { returnValue: clean(result) }); stack.pop(); return result; },
    output(...args) { const text = args.map((item) => typeof item === 'string' ? item : JSON.stringify(clean(item))).join(' '); output.push(text); record('program_output', undefined, () => ({}), { detail: text }); },
  };
  const __trace = trace;
  const console = { log: (...args) => trace.output(...args), error: (...args) => trace.output(...args), warn: (...args) => trace.output(...args) };
  try {
    eval(source);
    record('program_finish', undefined, () => ({}));
  } catch (caught) {
    try { record('exception', undefined, () => ({}), { detail: String(caught && caught.message || caught) }); } catch { /* Preserve trace evidence collected before the cap. */ }
  }
  send({ events, output });
};
`;

async function instrument(source: string, input: string) {
  const response = await fetch('/api/javascript/instrument', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language: 'javascript', source, input }),
  });
  const payload = await response.json() as { source?: string; error?: string };
  if (!response.ok || !payload.source) throw new Error(payload.error ?? 'Unable to prepare the JavaScript trace.');
  return payload.source;
}

export async function executeJavaScriptInBrowser(source: string, input: string): Promise<Execution> {
  const instrumentedSource = await instrument(source, input);
  const startedAt = new Date().toISOString();
  const workerUrl = URL.createObjectURL(new Blob([browserTraceRunner], { type: 'text/javascript' }));
  const worker = new Worker(workerUrl);
  try {
    const result = await new Promise<WorkerResult>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        worker.terminate();
        reject(new Error(`Execution exceeded the ${TIMEOUT_MS} ms browser limit.`));
      }, TIMEOUT_MS);
      worker.onmessage = ({ data }) => { window.clearTimeout(timeout); resolve(data as WorkerResult); };
      worker.onerror = (event) => { window.clearTimeout(timeout); reject(new Error(event.message || 'Browser execution failed.')); };
      worker.postMessage({ source: instrumentedSource, input, maxEvents: MAX_EVENTS });
    });
    const id = crypto.randomUUID();
    const events = result.events.map((event) => ({ ...event, executionId: id }));
    const exception = events.find((event) => event.type === 'exception');
    return {
      id, sourceVersionId: crypto.randomUUID(), language: 'javascript', source, input,
      status: exception ? 'partial' : 'complete', startedAt, finishedAt: new Date().toISOString(), events, output: result.output,
      ...(exception ? { error: { code: 'RUNTIME_ERROR' as const, message: exception.detail ?? 'The program raised an exception.', isTraceComplete: true } } : {}),
      limitation: 'JavaScript runs in a time-limited browser worker on your device. Synchronous code only; network APIs are disabled in the worker scope.',
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Browser execution failed.';
    return {
      id: crypto.randomUUID(), sourceVersionId: crypto.randomUUID(), language: 'javascript', source, input,
      status: 'failed', startedAt, finishedAt: new Date().toISOString(), events: [], output: [],
      error: { code: message.includes('browser limit') ? 'TIMEOUT' : 'RUNTIME_ERROR', message, isTraceComplete: false },
      limitation: 'JavaScript runs in a time-limited browser worker on your device.',
    };
  } finally {
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
  }
}

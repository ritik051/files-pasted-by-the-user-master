/* These runners live inside disposable containers. They emit only one JSON document on stdout. */
export const nodeRunner = String.raw`
const vm = require('vm');
const source = Buffer.from(process.env.SOURCE_B64 || '', 'base64').toString('utf8');
const input = Buffer.from(process.env.INPUT_B64 || '', 'base64').toString('utf8');
const maxEvents = Number(process.env.TRACE_LIMIT || 500);
const events = []; let sequence = 0; let frameCounter = 0; let previous = {}; const output = []; const stack = [];
const clean = (value, seen = new WeakSet(), depth = 0) => {
  if (value === undefined) return { $undefined: true };
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') return String(value) + 'n';
  if (typeof value === 'function') return '[Function]';
  if (typeof value === 'symbol') return String(value);
  if (depth > 4) return '[Depth limit]';
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]'; seen.add(value);
    if (Array.isArray(value)) return value.slice(0, 60).map(v => clean(v, seen, depth + 1));
    const out = {}; for (const key of Object.keys(value).slice(0, 60)) { try { out[key] = clean(value[key], seen, depth + 1); } catch { out[key] = '[Unreadable]'; } } return out;
  }
  return String(value);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function snapshot(getter) {
  let locals = {}; try { locals = clean(getter ? getter() : {}); } catch { locals = {}; }
  if (!locals || Array.isArray(locals) || typeof locals !== 'object') locals = {};
  if (stack.length) stack[stack.length - 1].locals = locals; else globalThis.__traceGlobals = locals;
  return { globals: clean(globalThis.__traceGlobals || {}), frames: clean(stack), output: [...output] };
}
function changesFor(state, kind) {
  const visible = { ...state.globals, ...(state.frames.length ? state.frames[state.frames.length - 1].locals : {}) };
  const changes = []; const keys = new Set([...Object.keys(previous), ...Object.keys(visible)]);
  for (const key of keys) if (!same(previous[key], visible[key])) changes.push({ path: key, before: previous[key], after: visible[key], kind: previous[key] === undefined ? 'declaration' : kind === 'mutation' ? 'mutation' : 'assignment' });
  previous = clean(visible); return changes.slice(0, 40);
}
function record(type, line, getter, extra = {}) {
  if (events.length >= maxEvents) throw new Error('TRACE_LIMIT');
  const state = snapshot(getter); const frame = stack.length ? stack[stack.length - 1] : undefined;
  events.push({ id: 'event-' + sequence, sequence: sequence++, type, observed: true, source: line ? { file: 'main.js', line, column: 0 } : undefined, frame: frame ? { id: frame.id, parentId: frame.parentId, functionName: frame.functionName } : undefined, changes: changesFor(state, extra.kind || 'assignment'), snapshot: state, ...extra });
}
const trace = {
  start() { record('program_start', 1, () => ({})); },
  line(line, kind, getter) { const types = { declaration: 'variable_declaration', assignment: 'variable_assignment', mutation: 'array_mutation', loop: 'loop_iteration', line: 'line_execution' }; record(types[kind] || 'line_execution', line, getter, { kind }); },
  condition(line, test, getter) { const result = Boolean(test()); record('conditional_evaluation', line, getter, { condition: result }); return result; },
  call(line, name, args, getter) { const parent = stack.length ? stack[stack.length - 1].id : null; const frame = { id: 'frame-' + (++frameCounter), parentId: parent, functionName: name, line, locals: {}, arguments: clean(args()) }; stack.push(frame); record('function_call', line, getter, { detail: 'Called ' + name }); },
  returnValue(line, value, getter) { const result = value(); record('function_return', line, getter, { returnValue: clean(result) }); stack.pop(); return result; },
  output(...args) { const text = args.map(v => typeof v === 'string' ? v : JSON.stringify(clean(v))).join(' '); output.push(text); record('program_output', undefined, () => ({}), { detail: text }); }
};
const sandbox = { __trace: trace, console: { log: (...args) => trace.output(...args), error: (...args) => trace.output(...args), warn: (...args) => trace.output(...args) }, input, JSON, Math, Number, String, Boolean, Array, Object, Set, Map, Date, RegExp, parseInt, parseFloat, Infinity, undefined };
try { vm.runInNewContext(source, sandbox, { timeout: 2000, filename: 'main.js', codeGeneration: { strings: false, wasm: false } }); record('program_finish', undefined, () => ({})); }
catch (error) { record('exception', Number(error.lineNumber) || undefined, () => ({}), { detail: String(error && error.message || error) }); }
process.stdout.write(JSON.stringify({ events, output }));
`;

export const pythonRunner = String.raw`
import base64, json, os, sys, traceback, io
source = base64.b64decode(os.environ.get('SOURCE_B64','')).decode('utf-8')
input_text = base64.b64decode(os.environ.get('INPUT_B64','')).decode('utf-8')
limit = int(os.environ.get('TRACE_LIMIT','500')); events=[]; output=[]; sequence=0; frames={}; order=[]; previous={}; counter=0
def clean(v, seen=None, depth=0):
  if seen is None: seen=set()
  if v is None or isinstance(v,(str,bool,int)): return v
  if isinstance(v,float): return v if abs(v) != float('inf') else str(v)
  if depth > 4: return '[Depth limit]'
  ident=id(v)
  if ident in seen: return '[Circular]'
  if isinstance(v,(list,tuple,set)):
    seen.add(ident); return [clean(x,seen,depth+1) for x in list(v)[:60]]
  if isinstance(v,dict):
    seen.add(ident); return {str(k):clean(x,seen,depth+1) for k,x in list(v.items())[:60]}
  return repr(v)[:300]
def current_state():
  globals_state={}; active=[]
  for key in order:
    f=frames.get(key)
    if f: active.append(f)
  return {'globals':globals_state,'frames':clean(active),'output':list(output)}
def emit(kind, frame=None, line=None, detail=None, return_value=None):
  global sequence, previous
  if len(events)>=limit: raise RuntimeError('TRACE_LIMIT')
  state=current_state(); visible={}
  if state['frames']: visible=state['frames'][-1].get('locals',{})
  changes=[]
  for k in set(previous)|set(visible):
    if previous.get(k) != visible.get(k): changes.append({'path':k,'before':previous.get(k),'after':visible.get(k),'kind':'declaration' if k not in previous else 'assignment'})
  previous=clean(visible)
  ev={'id':'event-'+str(sequence),'sequence':sequence,'type':kind,'observed':True,'changes':changes[:40],'snapshot':state}
  sequence+=1
  if line: ev['source']={'file':'main.py','line':line,'column':0}
  if frame: ev['frame']={'id':frame['id'],'parentId':frame['parentId'],'functionName':frame['functionName']}
  if detail: ev['detail']=detail
  if return_value is not None: ev['returnValue']=clean(return_value)
  events.append(ev)
def tracer(frame,event,arg):
  global counter
  if frame.f_code.co_filename != 'main.py': return tracer
  key=id(frame)
  if event=='call':
    counter+=1; parent=order[-1] if order else None; info={'id':'frame-'+str(counter),'parentId':frames[parent]['id'] if parent else None,'functionName':frame.f_code.co_name,'line':frame.f_lineno,'locals':clean(frame.f_locals),'arguments':clean(frame.f_locals)}; frames[key]=info; order.append(key); emit('function_call',info,frame.f_lineno,'Called '+frame.f_code.co_name)
  elif event=='line':
    if key in frames: frames[key]['locals']=clean(frame.f_locals); frames[key]['line']=frame.f_lineno
    emit('line_execution',frames.get(key),frame.f_lineno)
  elif event=='return':
    if key in frames: frames[key]['locals']=clean(frame.f_locals); emit('function_return',frames[key],frame.f_lineno,return_value=arg); order.remove(key); del frames[key]
  elif event=='exception':
    if key in frames: frames[key]['locals']=clean(frame.f_locals)
    emit('exception',frames.get(key),frame.f_lineno,str(arg[1]))
  return tracer
class Capture(io.TextIOBase):
  def write(self,text):
    text=str(text)
    if text.strip(): output.append(text.rstrip())
    return len(text)
old_out=sys.stdout; sys.stdout=Capture(); sys.stdin=io.StringIO(input_text)
try:
  emit('program_start',None,1); sys.settrace(tracer); exec(compile(source,'main.py','exec'),{'__name__':'__main__'}); sys.settrace(None); emit('program_finish')
except Exception as err:
  sys.settrace(None); emit('exception',None,None,str(err))
finally:
  sys.stdout=old_out
print(json.dumps({'events':events,'output':output}))
`;

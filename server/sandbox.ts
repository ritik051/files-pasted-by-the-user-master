import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ExecuteRequest, Execution, ExecutionError, ExecutionEvent, Language, RuntimeState } from '../shared/schema.js';
import { instrumentJavaScript, UnsupportedJavaScriptFeature } from './instrument-javascript.js';
import { nodeRunner, pythonRunner } from './runners.js';

const TIMEOUT_MS = Number(process.env.SANDBOX_TIMEOUT_MS ?? 5_000);
const TRACE_LIMIT = Number(process.env.SANDBOX_MAX_EVENTS ?? 500);

type RunnerResult = { events: Omit<ExecutionEvent, 'executionId'>[]; output: string[] };

function error(code: ExecutionError['code'], message: string, complete = false): ExecutionError {
  return { code, message, isTraceComplete: complete };
}

function dockerImage(language: Language) {
  if (language === 'javascript') return 'node:22-alpine';
  if (language === 'python') return 'python:3.12-alpine';
  if (language === 'java') return 'eclipse-temurin:21-jdk-alpine';
  return 'gcc:14.2';
}

function containerName() {
  return `tracecraft-${randomUUID()}`;
}

function buildDockerArgs(image: string, command: string, source: string, input: string, name: string) {
  return [
    'run', '--rm', '--name', name, '--init', '--network', 'none', '--read-only', '--pids-limit', '64', '--memory', '256m', '--cpus', '0.50',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=16m', '--workdir', '/tmp',
    '-e', `SOURCE_B64=${Buffer.from(source).toString('base64')}`,
    '-e', `INPUT_B64=${Buffer.from(input).toString('base64')}`,
    '-e', `TRACE_LIMIT=${TRACE_LIMIT}`,
    image,
    languageCommand(image),
    ...languageCommandArgs(image, command),
  ];
}

function languageCommand(image: string) {
  return image.startsWith('node') ? 'node' : 'python3';
}

function languageCommandArgs(image: string, command: string) {
  return image.startsWith('node') ? ['--max-old-space-size=128', '-e', command] : ['-c', command];
}

function invokeDocker(args: string[], name: string): Promise<{ stdout: string; stderr: string; timedOut: boolean; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH ?? '' } });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const limit = 1_100_000;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      // The Docker client can be killed without forwarding a signal to its foreground container.
      // The generated name is private to this execution, so this cannot affect another run.
      const cleanup = spawn('docker', ['kill', name], { stdio: 'ignore', env: { PATH: process.env.PATH ?? '' } });
      cleanup.unref();
    }, TIMEOUT_MS);
    child.stdout.on('data', (data) => { stdout = (stdout + data.toString()).slice(0, limit); });
    child.stderr.on('data', (data) => { stderr = (stderr + data.toString()).slice(0, limit); });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return resolve({ stdout, stderr, timedOut, exitCode: code });
      resolve({ stdout, stderr, timedOut: false, exitCode: code });
    });
  });
}

async function containerRun(language: 'javascript' | 'python', source: string, input: string): Promise<RunnerResult> {
  const image = dockerImage(language)!;
  const runner = language === 'javascript' ? nodeRunner : pythonRunner;
  const name = containerName();
  const result = await invokeDocker(buildDockerArgs(image, runner, source, input, name), name);
  if (result.timedOut) throw new Error('EXECUTION_TIMEOUT');
  if (result.exitCode !== 0) throw new Error(result.stderr || `Docker exited with code ${result.exitCode}.`);
  try {
    return JSON.parse(result.stdout) as RunnerResult;
  } catch {
    throw new Error(`SANDBOX_PROTOCOL_ERROR: ${result.stderr || 'runner did not return valid trace JSON'}`);
  }
}

function nativeShell(language: 'java' | 'cpp') {
  if (language === 'java') return `set -eu
printf '%s' "$SOURCE_B64" | base64 -d > /tmp/Main.java
printf '%s' "$INPUT_B64" | base64 -d > /tmp/input.txt
javac -g -d /tmp /tmp/Main.java || exit 42
java -Xmx128m -cp /tmp Main < /tmp/input.txt`;
  return `set -eu
printf '%s' "$SOURCE_B64" | base64 -d > /tmp/main.cpp
printf '%s' "$INPUT_B64" | base64 -d > /tmp/input.txt
g++ -std=c++20 -g -O0 /tmp/main.cpp -o /tmp/program || exit 42
/tmp/program < /tmp/input.txt`;
}

function nativeDockerArgs(language: 'java' | 'cpp', source: string, input: string, name: string) {
  const image = dockerImage(language)!;
  // C++ needs an executable build directory; Java can retain noexec on its temporary bytecode path.
  const temporaryMount = language === 'cpp' ? '/tmp:rw,nosuid,nodev,size=32m' : '/tmp:rw,nosuid,nodev,noexec,size=32m';
  return [
    'run', '--rm', '--name', name, '--init', '--network', 'none', '--read-only', '--pids-limit', '64', '--memory', '256m', '--cpus', '0.50',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--tmpfs', temporaryMount, '--workdir', '/tmp',
    '-e', `SOURCE_B64=${Buffer.from(source).toString('base64')}`,
    '-e', `INPUT_B64=${Buffer.from(input).toString('base64')}`,
    image, 'sh', '-ceu', nativeShell(language),
  ];
}

const emptyState = (): RuntimeState => ({ globals: {}, frames: [], output: [] });

/** Creates only facts observed from a compiler/process boundary; no locals are reconstructed or fabricated. */
export function terminalTrace(executionId: string, language: 'java' | 'cpp', rawOutput: string[], completed: boolean, detail?: string): ExecutionEvent[] {
  const extension = language === 'java' ? 'java' : 'cpp';
  const output = rawOutput.filter((line) => line.length > 0);
  const events: ExecutionEvent[] = [];
  const push = (type: ExecutionEvent['type'], eventDetail?: string) => {
    const eventOutput = type === 'program_output' ? output.slice(0, events.filter((event) => event.type === 'program_output').length + 1) : output.slice(0, events.filter((event) => event.type === 'program_output').length);
    events.push({ id: `event-${events.length}`, executionId, sequence: events.length, type, observed: true, changes: [], snapshot: { ...emptyState(), output: eventOutput }, detail: eventDetail });
  };
  push('program_start', `Observed through the ${language === 'java' ? 'JVM' : 'native'} process boundary.`);
  output.forEach((line) => push('program_output', line));
  if (completed) push('program_finish');
  else push('program_termination', detail ?? `The ${extension} process did not complete.`);
  return events;
}

async function nativeRun(request: ExecuteRequest, startedAt: string): Promise<Execution> {
  const id = randomUUID();
  const limitation = `${request.language === 'java' ? 'JVM' : 'C++'} compilation and program output are observed. Line-level locals, calls, and mutations require the dedicated debugger adapter and are intentionally not inferred.`;
  try {
    const name = containerName();
    const result = await invokeDocker(nativeDockerArgs(request.language as 'java' | 'cpp', request.source, request.input, name), name);
    const output = result.stdout.split(/\r?\n/).filter(Boolean);
    if (result.timedOut) {
      return { id, sourceVersionId: randomUUID(), language: request.language, source: request.source, input: request.input, status: 'partial', startedAt, finishedAt: new Date().toISOString(), output, limitation, events: terminalTrace(id, request.language as 'java' | 'cpp', output, false, `Execution exceeded the ${TIMEOUT_MS} ms sandbox limit.`), error: error('TIMEOUT', `Execution exceeded the ${TIMEOUT_MS} ms sandbox limit.`) };
    }
    if (result.exitCode !== 0) {
      const isCompileError = result.exitCode === 42;
      const message = result.stderr.trim() || (isCompileError ? 'Compilation failed.' : 'The process exited unsuccessfully.');
      return { id, sourceVersionId: randomUUID(), language: request.language, source: request.source, input: request.input, status: 'failed', startedAt, finishedAt: new Date().toISOString(), output, limitation, events: terminalTrace(id, request.language as 'java' | 'cpp', output, false, message), error: error(isCompileError ? 'SYNTAX_ERROR' : 'RUNTIME_ERROR', message) };
    }
    return { id, sourceVersionId: randomUUID(), language: request.language, source: request.source, input: request.input, status: 'complete', startedAt, finishedAt: new Date().toISOString(), output, limitation, events: terminalTrace(id, request.language as 'java' | 'cpp', output, true) };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Execution could not start.';
    return { id, sourceVersionId: randomUUID(), language: request.language, source: request.source, input: request.input, status: 'failed', startedAt, finishedAt: new Date().toISOString(), events: [], output: [], limitation, error: error('SANDBOX_UNAVAILABLE', message) };
  }
}

export async function execute(request: ExecuteRequest): Promise<Execution> {
  const startedAt = new Date().toISOString();
  if (request.language === 'java' || request.language === 'cpp') return nativeRun(request, startedAt);

  let source = request.source;
  if (request.language === 'javascript') {
    try {
      source = instrumentJavaScript(source);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to instrument the source.';
      return {
        id: randomUUID(), sourceVersionId: randomUUID(), language: request.language, source: request.source, input: request.input,
        status: 'failed', startedAt, finishedAt: new Date().toISOString(), events: [], output: [],
        error: error('UNSUPPORTED_FEATURE', message), limitation: 'The source was not executed because this feature cannot be traced reliably.',
      };
    }
  }

  const id = randomUUID();
  try {
    const result = await containerRun(request.language, source, request.input);
    const events = result.events.map((event) => ({ ...event, executionId: id }));
    const hasException = events.some((event) => event.type === 'exception');
    return {
      id, sourceVersionId: randomUUID(), language: request.language, source: request.source, input: request.input,
      status: hasException ? 'partial' : 'complete', startedAt, finishedAt: new Date().toISOString(), events, output: result.output,
      ...(hasException ? { error: error('RUNTIME_ERROR', events.find((event) => event.type === 'exception')?.detail ?? 'The program raised an exception.') } : {}),
    };
  } catch (cause) {
    const raw = cause instanceof Error ? cause.message : 'Execution could not start.';
    const timeout = raw.includes('EXECUTION_TIMEOUT');
    const unavailable = raw.includes('spawn docker') || raw.includes('Cannot connect to the Docker daemon') || raw.includes('SANDBOX_PROTOCOL_ERROR');
    return {
      id, sourceVersionId: randomUUID(), language: request.language, source: request.source, input: request.input,
      status: 'failed', startedAt, finishedAt: new Date().toISOString(), events: [], output: [],
      error: error(timeout ? 'TIMEOUT' : unavailable ? 'SANDBOX_UNAVAILABLE' : 'RUNTIME_ERROR', timeout ? `Execution exceeded the ${TIMEOUT_MS} ms sandbox limit.` : raw),
    };
  }
}

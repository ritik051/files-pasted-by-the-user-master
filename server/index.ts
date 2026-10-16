import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExecuteRequestSchema, ExecutionSchema, QuestionRequestSchema } from '../shared/schema.js';
import { execute } from './sandbox.js';
import { instrumentJavaScript } from './instrument-javascript.js';
import { resolveTeacherProvider } from './teacher-provider.js';
import { MemoryRunStore } from './types.js';

const app = express();
const store = new MemoryRunStore();
const port = Number(process.env.PORT ?? 8787);
const teacher = resolveTeacherProvider();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: ['http://localhost:5173'], methods: ['GET', 'POST'] }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => response.json({ status: 'ok', javascript: 'browser-worker', serverSandbox: 'docker-required' }));

app.get('/api/languages', (_request, response) => response.json([
  { id: 'javascript', label: 'JavaScript', status: 'supported', note: 'Synchronous script subset with statement-level tracing in an isolated browser worker.' },
  { id: 'python', label: 'Python', status: 'supported', note: 'CPython line, call, return, and exception tracing.' },
  { id: 'java', label: 'Java', status: 'limited', note: 'JVM compilation and output tracing; debugger-backed local state is not yet available.' },
  { id: 'cpp', label: 'C++', status: 'limited', note: 'Compiler execution and output tracing; debugger-backed local state is not yet available.' },
]));

app.post('/api/execute', async (request, response) => {
  const parsed = ExecuteRequestSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Invalid execution request.', detail: parsed.error.flatten() });
  const execution = await execute(parsed.data);
  store.save(execution);
  response.status(execution.status === 'failed' ? 422 : 201).json(execution);
});

/** Instruments JavaScript without running it. The browser worker executes the result, so a public
 * Railway web service never evaluates visitor code in its own process. */
app.post('/api/javascript/instrument', (request, response) => {
  const parsed = ExecuteRequestSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Invalid execution request.', detail: parsed.error.flatten() });
  if (parsed.data.language !== 'javascript') return response.status(400).json({ error: 'This endpoint only instruments JavaScript.' });
  try {
    response.json({ source: instrumentJavaScript(parsed.data.source) });
  } catch (cause) {
    response.status(422).json({ error: cause instanceof Error ? cause.message : 'Unable to instrument the source.' });
  }
});

/** Stores a trace produced in the requesting browser so the lesson and teacher endpoints can use it. */
app.post('/api/executions', (request, response) => {
  const parsed = ExecutionSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Invalid browser execution.', detail: parsed.error.flatten() });
  if (parsed.data.language !== 'javascript') return response.status(400).json({ error: 'Only browser JavaScript traces may be stored here.' });
  store.save(parsed.data);
  response.status(201).json(parsed.data);
});

app.get('/api/executions/:id', (request, response) => {
  const execution = store.get(request.params.id);
  if (!execution) return response.status(404).json({ error: 'Execution not found.' });
  response.json(execution);
});

app.get('/api/executions/:id/lesson', (request, response) => {
  const execution = store.get(request.params.id);
  if (!execution) return response.status(404).json({ error: 'Execution not found.' });
  response.json(teacher.buildLesson(execution));
});

app.post('/api/executions/:id/questions', (request, response) => {
  const execution = store.get(request.params.id);
  if (!execution) return response.status(404).json({ error: 'Execution not found.' });
  const parsed = QuestionRequestSchema.safeParse(request.body);
  if (!parsed.success) return response.status(400).json({ error: 'Invalid question.', detail: parsed.error.flatten() });
  response.json({ answer: teacher.answer(execution, parsed.data.eventId, parsed.data.question, parsed.data.selectedObject), evidence: [parsed.data.eventId] });
});

if (process.env.NODE_ENV === 'production') {
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(directory, '../dist');
  const publicOrigin = (request: express.Request) => `${request.protocol}://${request.get('host')}`;
  app.get('/robots.txt', (request, response) => {
    response.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${publicOrigin(request)}/sitemap.xml\n`);
  });
  app.get('/sitemap.xml', (request, response) => {
    const origin = publicOrigin(request);
    response.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url></urlset>`);
  });
  app.use(express.static(clientDist));
  app.get('/{*splat}', (_request, response) => response.sendFile(path.join(clientDist, 'index.html')));
}

app.use((_request, response) => response.status(404).json({ error: 'Route not found.' }));
app.listen(port, () => console.log(`Tracecraft API listening on http://localhost:${port}`));

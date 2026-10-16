import type { Execution, Language, Lesson } from '../../shared/schema';
import { executeJavaScriptInBrowser } from './browser-trace';

async function decode<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok && !payload.events) throw new Error(payload.error ?? payload.detail ?? 'Request failed.');
  return payload as T;
}

async function saveBrowserExecution(execution: Execution) {
  return fetch('/api/executions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(execution) }).then(decode<Execution>);
}

export async function executeSource(language: Language, source: string, input: string) {
  if (language === 'javascript') return saveBrowserExecution(await executeJavaScriptInBrowser(source, input));
  return fetch('/api/execute', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language, source, input }) }).then(decode<Execution>);
}

export function getLesson(id: string) {
  return fetch(`/api/executions/${id}/lesson`).then(decode<Lesson>);
}

export function askTeacher(id: string, eventId: string, question: string, selectedObject?: string) {
  return fetch(`/api/executions/${id}/questions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId, question, selectedObject }) }).then(decode<{ answer: string; evidence: string[] }>);
}

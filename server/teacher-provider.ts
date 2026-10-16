import type { Execution, Lesson } from '../shared/schema.js';
import { answerQuestion, buildLesson } from './lesson.js';

export interface TeacherProvider {
  readonly id: string;
  buildLesson(execution: Execution): Lesson;
  answer(execution: Execution, eventId: string, question: string, selectedObject?: string): string;
}

/** Default provider: deterministic explanations whose execution claims cite recorded events. */
export class TraceGroundedTeacherProvider implements TeacherProvider {
  readonly id = 'trace-grounded';
  buildLesson(execution: Execution) { return buildLesson(execution); }
  answer(execution: Execution, eventId: string, question: string, selectedObject?: string) {
    return answerQuestion(execution, eventId, question, selectedObject);
  }
}

export function resolveTeacherProvider(providerId = process.env.TEACHER_PROVIDER ?? 'trace-grounded'): TeacherProvider {
  if (providerId === 'trace-grounded') return new TraceGroundedTeacherProvider();
  throw new Error(`Unknown teacher provider "${providerId}". Configure a registered provider; source code is not sent to a third party by default.`);
}

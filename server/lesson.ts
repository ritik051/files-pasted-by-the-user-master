import type { Execution, ExecutionEvent, Lesson, LessonSegment, RuntimeState } from '../shared/schema.js';
import { changeSummary, formatValue } from '../shared/reconstruct.js';

function activeFrame(state: RuntimeState) {
  return state.frames.at(-1);
}

function eventNarration(event: ExecutionEvent): string {
  const location = event.source ? `At line ${event.source.line}, ` : '';
  const frame = activeFrame(event.snapshot);
  switch (event.type) {
    case 'program_start': return 'We are starting this recorded execution. Watch the code highlight, scene, and variable inspector move together.';
    case 'variable_declaration': return `${location}the program creates or initializes a value. ${changeSummary(event)}.`;
    case 'variable_assignment': return `${location}an existing value changes. ${changeSummary(event)}.`;
    case 'array_mutation': return `${location}a collection changes in place. ${changeSummary(event)}.`;
    case 'conditional_evaluation': return `${location}the condition evaluates to ${event.condition ? 'true' : 'false'}, so execution follows the ${event.condition ? 'matching' : 'other'} path.`;
    case 'loop_iteration': return `${location}the loop advances with the current state: ${changeSummary(event)}.`;
    case 'function_call': return `${location}${frame?.functionName ?? 'a function'} receives a new stack frame. Its arguments are now visible in the scene.`;
    case 'function_return': return `${location}${frame?.functionName ?? 'the function'} returns ${formatValue(event.returnValue)} and control goes back to its caller.`;
    case 'program_output': return `The program writes ${event.detail ?? 'a value'} to its output.`;
    case 'exception': return `The runtime reports an exception: ${event.detail ?? 'unknown error'}. The partial trace remains available for inspection.`;
    case 'program_finish': return 'The program has finished. The final state and output remain available to inspect.';
    default: return `${location}the program reaches this observed execution point. ${changeSummary(event)}`;
  }
}

function classify(execution: Execution) {
  const source = execution.source;
  if (/\b(left|right|mid|middle)\b/.test(source) && /while/.test(source)) return { name: 'Search with moving bounds', complexity: 'Complexity depends on the submitted implementation; the recorded trace alone does not prove a Big-O bound.' };
  if (/\bfor\b|\bwhile\b/.test(source)) return { name: 'Iterative control flow', complexity: 'The trace shows one concrete input. Review loop nesting and bounds before claiming a general complexity.' };
  if (/\bfunction\b|\bdef\b/.test(source)) return { name: 'Function and call-stack execution', complexity: 'The concrete trace captures calls and returns; general complexity depends on the function structure and input size.' };
  return { name: 'General program execution', complexity: 'A complexity claim needs more static analysis than one recorded run provides.' };
}

export function buildLesson(execution: Execution): Lesson {
  const classification = classify(execution);
  const segments: LessonSegment[] = execution.events.map((event) => ({
    id: `segment-${event.sequence}`,
    eventIds: [event.id],
    kind: event.type === 'exception' ? 'error' : event.type === 'program_finish' ? 'result' : 'execution',
    text: eventNarration(event),
    evidence: [event.id],
  }));
  return {
    executionId: execution.id,
    title: `${execution.language === 'javascript' ? 'JavaScript' : 'Python'} execution lesson`,
    summary: `This lesson is grounded in ${execution.events.length} recorded runtime events for the exact source and input shown in the workspace.`,
    algorithm: classification.name,
    complexity: classification.complexity,
    segments,
  };
}

export function answerQuestion(execution: Execution, eventId: string, question: string, selectedObject?: string) {
  const currentIndex = execution.events.findIndex((event) => event.id === eventId);
  const event = execution.events[currentIndex];
  if (!event) return 'That execution event is no longer available.';
  const normalized = question.toLowerCase();
  if (/what.*if|would.*false|different input|hypothetical/.test(normalized)) {
    return 'That asks about a different execution path. Change the input or source and run a new lesson; I will keep this trace separate from the new run.';
  }
  if (/complexity|big.?o/.test(normalized)) return buildLesson(execution).complexity;
  if (/previous|difference|changed/.test(normalized)) return `At this event, the observed changes are: ${changeSummary(event)}.`;
  if (/why.*function|why.*call/.test(normalized) && event.type === 'function_call') return `The recorded runtime entered ${event.frame?.functionName ?? 'this function'} at line ${event.source?.line ?? 'an unavailable source location'}. Its call is an observed fact; the arguments in this frame are ${formatValue(event.snapshot.frames.at(-1)?.arguments ?? {})}.`;
  const target = selectedObject ? ` for ${selectedObject}` : '';
  return `At recorded event ${event.sequence}${target}, ${eventNarration(event)} This answer is based on the code run and its captured state, not a simulated alternative.`;
}

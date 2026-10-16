import { z } from 'zod';

export const LanguageSchema = z.enum(['javascript', 'python', 'java', 'cpp']);
export type Language = z.infer<typeof LanguageSchema>;

export const SourceLocationSchema = z.object({
  file: z.string().default('main'),
  line: z.number().int().positive(),
  column: z.number().int().nonnegative().default(0),
});

export const FrameSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  functionName: z.string(),
  line: z.number().int().positive().optional(),
  locals: z.record(z.string(), z.unknown()),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

export const RuntimeStateSchema = z.object({
  globals: z.record(z.string(), z.unknown()),
  frames: z.array(FrameSchema),
  output: z.array(z.string()),
});
export type RuntimeState = z.infer<typeof RuntimeStateSchema>;

export const ChangeSchema = z.object({
  path: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  kind: z.enum(['declaration', 'assignment', 'mutation', 'scope', 'output']),
});
export type TraceChange = z.infer<typeof ChangeSchema>;

export const EventTypeSchema = z.enum([
  'program_start',
  'program_finish',
  'line_execution',
  'function_call',
  'function_return',
  'variable_declaration',
  'variable_assignment',
  'conditional_evaluation',
  'loop_iteration',
  'array_mutation',
  'collection_mutation',
  'program_output',
  'exception',
  'program_termination',
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const ExecutionEventSchema = z.object({
  id: z.string(),
  executionId: z.string(),
  sequence: z.number().int().nonnegative(),
  type: EventTypeSchema,
  observed: z.boolean(),
  source: SourceLocationSchema.optional(),
  frame: FrameSchema.pick({ id: true, parentId: true, functionName: true }).optional(),
  changes: z.array(ChangeSchema),
  snapshot: RuntimeStateSchema,
  detail: z.string().optional(),
  returnValue: z.unknown().optional(),
  condition: z.boolean().optional(),
});
export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>;

export const ExecutionErrorSchema = z.object({
  code: z.enum([
    'SYNTAX_ERROR',
    'RUNTIME_ERROR',
    'TIMEOUT',
    'RESOURCE_LIMIT',
    'UNSUPPORTED_FEATURE',
    'SANDBOX_UNAVAILABLE',
    'TRACE_LIMIT',
  ]),
  message: z.string(),
  line: z.number().int().positive().optional(),
  isTraceComplete: z.boolean(),
});
export type ExecutionError = z.infer<typeof ExecutionErrorSchema>;

export const ExecutionSchema = z.object({
  id: z.string(),
  sourceVersionId: z.string(),
  language: LanguageSchema,
  source: z.string(),
  input: z.string(),
  status: z.enum(['complete', 'failed', 'partial']),
  startedAt: z.string(),
  finishedAt: z.string(),
  events: z.array(ExecutionEventSchema),
  error: ExecutionErrorSchema.optional(),
  output: z.array(z.string()),
  limitation: z.string().optional(),
});
export type Execution = z.infer<typeof ExecutionSchema>;

export const ExecuteRequestSchema = z.object({
  language: LanguageSchema,
  source: z.string().min(1).max(50_000),
  input: z.string().max(10_000).default(''),
});
export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;

export const LessonSegmentSchema = z.object({
  id: z.string(),
  eventIds: z.array(z.string()).min(1),
  kind: z.enum(['execution', 'algorithm', 'result', 'error']),
  text: z.string(),
  evidence: z.array(z.string()),
});
export type LessonSegment = z.infer<typeof LessonSegmentSchema>;

export const LessonSchema = z.object({
  executionId: z.string(),
  title: z.string(),
  summary: z.string(),
  algorithm: z.string(),
  complexity: z.string(),
  segments: z.array(LessonSegmentSchema),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const QuestionRequestSchema = z.object({
  question: z.string().min(1).max(2_000),
  eventId: z.string().min(1),
  selectedObject: z.string().max(200).optional(),
});

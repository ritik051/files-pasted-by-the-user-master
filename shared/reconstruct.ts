import type { ExecutionEvent, RuntimeState } from './schema';

/** Events are immutable checkpoints. Seeking never executes submitted source again. */
export function stateAt(events: ExecutionEvent[], index: number): RuntimeState | undefined {
  if (index < 0 || index >= events.length) return undefined;
  return structuredClone(events[index].snapshot);
}

export function changeSummary(event: ExecutionEvent): string {
  if (event.changes.length === 0) return 'No observable variable changed at this event.';
  return event.changes
    .slice(0, 3)
    .map((change) => `${change.path} → ${formatValue(change.after)}`)
    .join(', ');
}

export function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  try {
    const printed = JSON.stringify(value);
    return printed === undefined ? String(value) : printed;
  } catch {
    return String(value);
  }
}

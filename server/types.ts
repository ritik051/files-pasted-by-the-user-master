import type { Execution } from '../shared/schema.js';

export interface RunStore {
  save(execution: Execution): void;
  get(id: string): Execution | undefined;
}

export class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, Execution>();

  save(execution: Execution) {
    this.runs.set(execution.id, execution);
  }

  get(id: string) {
    return this.runs.get(id);
  }
}

import { create } from 'zustand';
import type { Execution, Language, Lesson } from '../shared/schema';
import { stateAt } from '../shared/reconstruct';

const examples: Record<Language, string> = {
  javascript: `// Try a different input or replace this program.\nfunction binarySearch(values, target) {\n  let left = 0;\n  let right = values.length - 1;\n\n  while (left <= right) {\n    const middle = Math.floor((left + right) / 2);\n    if (values[middle] === target) {\n      return middle;\n    }\n    if (values[middle] < target) {\n      left = middle + 1;\n    } else {\n      right = middle - 1;\n    }\n  }\n\n  return -1;\n}\n\nconst values = [3, 7, 12, 18, 24, 31, 42];\nconst answer = binarySearch(values, 24);\nconsole.log(answer);`,
  python: `def binary_search(values, target):\n    left = 0\n    right = len(values) - 1\n\n    while left <= right:\n        middle = (left + right) // 2\n        if values[middle] == target:\n            return middle\n        if values[middle] < target:\n            left = middle + 1\n        else:\n            right = middle - 1\n    return -1\n\nvalues = [3, 7, 12, 18, 24, 31, 42]\nanswer = binary_search(values, 24)\nprint(answer)`,
  java: `public class Main {\n  public static void main(String[] args) {\n    int[] values = {3, 7, 12, 18, 24};\n    int total = 0;\n    for (int value : values) {\n      total += value;\n    }\n    System.out.println(total);\n  }\n}`,
  cpp: `#include <iostream>\n#include <vector>\n\nint main() {\n  std::vector<int> values{3, 7, 12, 18, 24};\n  int total = 0;\n  for (int value : values) {\n    total += value;\n  }\n  std::cout << total << "\\n";\n  return 0;\n}`,
};

export function languageExample(language: Language) {
  return examples[language];
}

type AppState = {
  language: Language;
  source: string;
  input: string;
  execution?: Execution;
  lesson?: Lesson;
  currentIndex: number;
  playing: boolean;
  speed: number;
  selectedObject?: string;
  loading: boolean;
  error?: string;
  savedLessons: SavedLesson[];
  setLanguage: (language: Language) => void;
  setSource: (source: string) => void;
  setInput: (input: string) => void;
  setResult: (execution: Execution, lesson?: Lesson) => void;
  setIndex: (index: number) => void;
  step: (amount: number) => void;
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: number) => void;
  setSelectedObject: (selected?: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error?: string) => void;
  saveCurrent: () => void;
  loadSaved: (id: string) => void;
  deleteSaved: (id: string) => void;
  resetLesson: () => void;
};

export type SavedLesson = {
  id: string;
  savedAt: string;
  title: string;
  language: Language;
  source: string;
  input: string;
  execution: Execution;
  lesson?: Lesson;
};

const storageKey = 'tracecraft.saved-lessons.v1';

function readSavedLessons(): SavedLesson[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch { return []; }
}

function persistSavedLessons(lessons: SavedLesson[]) {
  try { localStorage.setItem(storageKey, JSON.stringify(lessons.slice(0, 8))); } catch { /* Storage is optional; current lesson stays usable. */ }
}

export const useAppStore = create<AppState>((set, get) => ({
  language: 'javascript', source: languageExample('javascript'), input: '', currentIndex: 0, playing: false, speed: 1, loading: false, savedLessons: readSavedLessons(),
  setLanguage: (language) => set({ language }),
  setSource: (source) => set({ source }),
  setInput: (input) => set({ input }),
  setResult: (execution, lesson) => set({ execution, lesson, currentIndex: 0, playing: false, error: undefined, selectedObject: undefined }),
  setIndex: (index) => set({ currentIndex: Math.max(0, Math.min(index, Math.max(0, (get().execution?.events.length ?? 1) - 1))), playing: false }),
  step: (amount) => {
    const events = get().execution?.events ?? [];
    const next = Math.max(0, Math.min(get().currentIndex + amount, Math.max(0, events.length - 1)));
    set({ currentIndex: next, playing: false });
  },
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setSelectedObject: (selectedObject) => set({ selectedObject }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  saveCurrent: () => {
    const current = get();
    if (!current.execution) return;
    const item: SavedLesson = {
      id: crypto.randomUUID(), savedAt: new Date().toISOString(), title: current.lesson?.title ?? `${current.language} execution`,
      language: current.language, source: current.source, input: current.input, execution: current.execution, lesson: current.lesson,
    };
    const savedLessons = [item, ...current.savedLessons].slice(0, 8);
    persistSavedLessons(savedLessons);
    set({ savedLessons });
  },
  loadSaved: (id) => {
    const item = get().savedLessons.find((candidate) => candidate.id === id);
    if (!item) return;
    set({ language: item.language, source: item.source, input: item.input, execution: item.execution, lesson: item.lesson, currentIndex: 0, playing: false, selectedObject: undefined, error: undefined });
  },
  deleteSaved: (id) => {
    const savedLessons = get().savedLessons.filter((item) => item.id !== id);
    persistSavedLessons(savedLessons);
    set({ savedLessons });
  },
  resetLesson: () => set({ execution: undefined, lesson: undefined, currentIndex: 0, playing: false, selectedObject: undefined, error: undefined }),
}));

export function useCurrentEvent() {
  return useAppStore((state) => state.execution?.events[state.currentIndex]);
}

export function useCurrentState() {
  return useAppStore((state) => state.execution ? stateAt(state.execution.events, state.currentIndex) : undefined);
}

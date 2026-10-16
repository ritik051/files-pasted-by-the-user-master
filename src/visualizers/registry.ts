import type { RuntimeState } from '../../shared/schema';

export type ArrayPointer = { name: string; index: number; color: string };
export type SceneModule = 'variables' | 'call-stack' | 'array' | 'search-pointers';
export type ScenePlan = {
  modules: SceneModule[];
  array?: { name: string; values: unknown[]; pointers: ArrayPointer[] };
};

const pointerColors: Record<string, string> = {
  left: '#7ee7c9', right: '#ffad77', middle: '#cf9dff', mid: '#cf9dff', start: '#7ee7c9', end: '#ffad77', i: '#78c8ff', j: '#ffdb7e',
};

function currentScope(state: RuntimeState) {
  return state.frames.at(-1)?.locals ?? state.globals;
}

/**
 * A scene plan only activates modules supported by the captured state. It never identifies an
 * algorithm from source text alone or invents a pointer position that was not recorded.
 */
export function planScene(state?: RuntimeState): ScenePlan {
  if (!state) return { modules: [] };
  const scope = currentScope(state);
  const array = Object.entries(scope).find(([, value]) => Array.isArray(value)) as [string, unknown[]] | undefined;
  const modules: SceneModule[] = ['variables', 'call-stack'];
  if (!array) return { modules };
  modules.push('array');
  const pointers = Object.entries(scope)
    .filter(([name, value]) => Object.hasOwn(pointerColors, name) && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < array[1].length)
    .map(([name, index]) => ({ name, index: index as number, color: pointerColors[name] }));
  if (pointers.length) modules.push('search-pointers');
  return { modules, array: { name: array[0], values: array[1], pointers } };
}

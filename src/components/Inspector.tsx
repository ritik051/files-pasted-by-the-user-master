import type { ExecutionEvent, RuntimeState } from '../../shared/schema';
import { formatValue } from '../../shared/reconstruct';

export function Inspector({ state, event, selected }: { state?: RuntimeState; event?: ExecutionEvent; selected?: string }) {
  const scope = state?.frames.at(-1)?.locals ?? state?.globals ?? {};
  return <section className="panel inspector-panel">
    <div className="panel-title-row"><div><span className="eyebrow">Runtime inspector</span><h2>Observed state</h2></div><span className="event-badge">{event ? `#${event.sequence}` : 'waiting'}</span></div>
    <div className="inspection-meta"><span>{event?.type?.replaceAll('_', ' ') ?? 'No event selected'}</span>{event?.source && <span>line {event.source.line}</span>}</div>
    <div className="variable-list" aria-live="polite">
      {Object.entries(scope).length === 0 ? <p className="muted">Run code to inspect recorded variables.</p> : Object.entries(scope).map(([name, value]) => <div className={`variable-row ${selected === name ? 'selected' : ''}`} key={name}><code>{name}</code><span>{formatValue(value)}</span></div>)}
    </div>
    <div className="call-stack-summary"><span>Active frame</span><strong>{state?.frames.at(-1)?.functionName ?? 'global scope'}</strong></div>
    {selected && <div className="selection-detail"><span className="eyebrow">Selected object</span><strong>{selected}</strong><p>{event?.changes.find((change) => change.path === selected || selected.startsWith(`${change.path}[`)) ? 'This object changed at the current recorded event.' : 'This object is present in the current recorded state.'}</p></div>}
  </section>;
}

import { useAppStore } from '../store';

export function SavedLessons({ close }: { close: () => void }) {
  const lessons = useAppStore((state) => state.savedLessons);
  const load = useAppStore((state) => state.loadSaved);
  const remove = useAppStore((state) => state.deleteSaved);
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}>
    <section className="saved-modal" role="dialog" aria-modal="true" aria-labelledby="saved-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="panel-title-row"><div><span className="eyebrow">Browser library</span><h2 id="saved-title">Saved lessons</h2></div><button className="close-button" onClick={close} aria-label="Close saved lessons">×</button></div>
      {lessons.length === 0 ? <p className="muted">No lessons are saved in this browser yet.</p> : <div className="saved-list">{lessons.map((item) => <article key={item.id}>
        <div><strong>{item.title}</strong><span>{item.language} · {item.execution.events.length} events · {new Date(item.savedAt).toLocaleDateString()}</span></div>
        <div><button onClick={() => { load(item.id); close(); }}>Resume</button><button className="delete" onClick={() => remove(item.id)}>Delete</button></div>
      </article>)}</div>}
      <p className="storage-note">Lessons remain in this browser. Saving never sends source code anywhere.</p>
    </section>
  </div>;
}

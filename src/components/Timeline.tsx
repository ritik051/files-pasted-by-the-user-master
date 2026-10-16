import { useAppStore } from '../store';

export function Timeline() {
  const execution = useAppStore((state) => state.execution);
  const index = useAppStore((state) => state.currentIndex);
  const playing = useAppStore((state) => state.playing);
  const speed = useAppStore((state) => state.speed);
  const setIndex = useAppStore((state) => state.setIndex);
  const step = useAppStore((state) => state.step);
  const setPlaying = useAppStore((state) => state.setPlaying);
  const setSpeed = useAppStore((state) => state.setSpeed);
  const count = execution?.events.length ?? 0;
  const jumpTo = (predicate: (event: NonNullable<typeof execution>['events'][number]) => boolean) => {
    const events = execution?.events ?? [];
    const next = events.findIndex((event, eventIndex) => eventIndex > index && predicate(event));
    const wrapped = events.findIndex((event) => predicate(event));
    setIndex(next >= 0 ? next : wrapped >= 0 ? wrapped : index);
  };
  return <section className="timeline" aria-label="Execution timeline">
    <div className="timeline-controls">
      <button title="Previous step" disabled={!count || index === 0} onClick={() => step(-1)}>↤</button>
      <button className="play-button" title={playing ? 'Pause lesson' : 'Play lesson'} disabled={!count} onClick={() => setPlaying(!playing)}>{playing ? 'Ⅱ' : '▶'}</button>
      <button title="Next step" disabled={!count || index === count - 1} onClick={() => step(1)}>↦</button>
      <span className="step-count">{count ? `${index + 1} / ${count}` : 'No trace'}</span>
    </div>
    <input aria-label="Seek execution timeline" className="scrubber" type="range" min={0} max={Math.max(0, count - 1)} value={Math.min(index, Math.max(0, count - 1))} disabled={!count} onChange={(event) => setIndex(Number(event.target.value))} />
    <select className="speed-select" aria-label="Playback speed" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={0.75}>0.75×</option><option value={1}>1×</option><option value={1.25}>1.25×</option><option value={1.5}>1.5×</option></select>
    <div className="timeline-jumps"><button disabled={!count} onClick={() => setIndex(0)}>Restart</button><button disabled={!count} onClick={() => jumpTo((event) => event.type === 'function_call')}>Call</button><button disabled={!count} onClick={() => jumpTo((event) => event.type === 'function_return')}>Return</button><button disabled={!count} onClick={() => jumpTo((event) => event.changes.length > 0)}>Change</button></div>
  </section>;
}

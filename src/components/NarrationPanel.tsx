import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserSpeechAdapter } from '../services/narration';
import { useAppStore } from '../store';

export function NarrationPanel() {
  const lesson = useAppStore((state) => state.lesson);
  const index = useAppStore((state) => state.currentIndex);
  const playing = useAppStore((state) => state.playing);
  const speed = useAppStore((state) => state.speed);
  const setPlaying = useAppStore((state) => state.setPlaying);
  const step = useAppStore((state) => state.step);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const adapter = useMemo(() => new BrowserSpeechAdapter(), []);
  const lastSpoken = useRef<string | undefined>(undefined);
  const segment = lesson?.segments[index];

  useEffect(() => () => adapter.cancel(), [adapter]);
  useEffect(() => {
    if (!segment || !adapter.available()) return;
    if (!playing) {
      if (lastSpoken.current === segment.id) adapter.pause();
      return;
    }
    if (muted) return;
    if (lastSpoken.current === segment.id) {
      adapter.resume();
      return;
    }
    lastSpoken.current = segment.id;
    adapter.speak(segment.text, speed, volume, () => {
      const snapshot = useAppStore.getState();
      if (!snapshot.playing || snapshot.currentIndex !== index) return;
      if (index < (snapshot.execution?.events.length ?? 0) - 1) {
        lastSpoken.current = undefined;
        snapshot.step(1);
        snapshot.setPlaying(true);
      } else snapshot.setPlaying(false);
    });
  }, [adapter, index, muted, playing, segment, speed, volume]);

  useEffect(() => {
    if (playing && (muted || !adapter.available())) {
      const timer = window.setTimeout(() => {
        const current = useAppStore.getState();
        if (current.currentIndex < (current.execution?.events.length ?? 0) - 1) { current.step(1); current.setPlaying(true); } else current.setPlaying(false);
      }, 2300 / speed);
      return () => window.clearTimeout(timer);
    }
  }, [adapter, index, muted, playing, speed]);

  const replay = () => { lastSpoken.current = undefined; if (segment && !muted && adapter.available()) adapter.speak(segment.text, speed, volume, () => setPlaying(false)); };
  return <section className="panel narration-panel">
    <div className="panel-title-row"><div><span className="eyebrow">AI teacher</span><h2>Guided narration</h2></div><span className={`narration-status ${adapter.available() && !muted ? 'ready' : ''}`}>{adapter.available() && !muted ? 'voice ready' : 'transcript mode'}</span></div>
    <p className="narration-text">{segment?.text ?? 'Run a supported program to create a trace-grounded lesson. The written transcript stays available if speech is unavailable.'}</p>
    <div className="narration-actions"><button onClick={() => setPlaying(!playing)} disabled={!segment}>{playing ? 'Pause' : 'Play'}</button><button onClick={replay} disabled={!segment}>Replay</button><button onClick={() => { lastSpoken.current = undefined; setMuted(!muted); adapter.cancel(); }}>{muted ? 'Unmute' : 'Mute'}</button><label className="volume-control">Vol <input aria-label="Narration volume" type="range" min="0" max="1" step="0.1" value={volume} onChange={(event) => { lastSpoken.current = undefined; setVolume(Number(event.target.value)); }} /></label></div>
    <div className="transcript" aria-label="Narration transcript">{lesson?.segments.slice(0, 8).map((item, itemIndex) => <button key={item.id} className={itemIndex === index ? 'active' : ''} onClick={() => { lastSpoken.current = undefined; useAppStore.getState().setIndex(itemIndex); }}>{itemIndex + 1}. {item.text}</button>)}</div>
  </section>;
}

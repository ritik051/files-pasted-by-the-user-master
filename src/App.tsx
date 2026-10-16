import { lazy, Suspense, useCallback, useState } from 'react';
import { CodeWorkspace } from './components/CodeWorkspace';
import { Inspector } from './components/Inspector';
import { NarrationPanel } from './components/NarrationPanel';
import { SavedLessons } from './components/SavedLessons';
import { TeacherPanel } from './components/TeacherPanel';
import { Timeline } from './components/Timeline';
import { executeSource, getLesson } from './services/api';
import { useAppStore, useCurrentEvent, useCurrentState } from './store';

const ExecutionScene = lazy(() => import('./components/ExecutionScene'));

export function App() {
  const language = useAppStore((state) => state.language);
  const source = useAppStore((state) => state.source);
  const input = useAppStore((state) => state.input);
  const error = useAppStore((state) => state.error);
  const execution = useAppStore((state) => state.execution);
  const selected = useAppStore((state) => state.selectedObject);
  const setSelected = useAppStore((state) => state.setSelectedObject);
  const setLoading = useAppStore((state) => state.setLoading);
  const setResult = useAppStore((state) => state.setResult);
  const setError = useAppStore((state) => state.setError);
  const saveCurrent = useAppStore((state) => state.saveCurrent);
  const [dark, setDark] = useState(true);
  const [savedOpen, setSavedOpen] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const event = useCurrentEvent();
  const state = useCurrentState();
  const extension = { javascript: 'js', python: 'py', java: 'java', cpp: 'cpp' }[language];

  const run = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      const result = await executeSource(language, source, input);
      const lesson = result.events.length ? await getLesson(result.id) : undefined;
      setResult(result, lesson);
      if (result.error) setError(result.error.message);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to start execution.'); } finally { setLoading(false); }
  }, [input, language, setError, setLoading, setResult, source]);

  return <main className={dark ? 'app-shell dark' : 'app-shell light'}>
    <header className="top-nav">
      <div className="brand"><div className="brand-mark">⌁</div><div><strong>tracecraft</strong><span>code, made visible</span></div></div>
      <div className="nav-status"><span className={`status-dot ${execution?.status === 'complete' ? 'complete' : ''}`} />{execution ? `${execution.events.length} recorded events` : 'Ready for a lesson'}</div>
      <div className="nav-actions"><button onClick={() => useAppStore.getState().resetLesson()}>New lesson</button><button onClick={() => setSavedOpen(true)}>Saved lessons</button>{execution && <button onClick={saveCurrent}>Save</button>}<button className="icon-button" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? '☀' : '◐'}</button></div>
    </header>
    {error && <div className="notice" role="alert"><strong>{execution?.error?.code ?? 'Lesson status'}:</strong> {error}<button onClick={() => setError(undefined)} aria-label="Dismiss">×</button></div>}
    <div className="workspace-grid">
      <aside className="left-column"><CodeWorkspace onRun={() => void run()} /><NarrationPanel /></aside>
      <section className="classroom-column">
        <div className="classroom-header"><div><span className="eyebrow">3D classroom</span><h1>{event ? `Event ${event.sequence}: ${event.type.replaceAll('_', ' ')}` : 'See execution take shape'}</h1></div><div className="scene-header-actions"><button onClick={() => setCameraKey((key) => key + 1)}>Reset camera</button><div className="current-line">{event?.source ? `main.${extension}:${event.source.line}` : 'process-level event'}</div></div></div>
        <Suspense fallback={<div className="scene-loading">Loading the 3D classroom…</div>}><ExecutionScene state={state} selected={selected} onSelect={setSelected} resetCameraKey={cameraKey} /></Suspense>
        <Timeline />
      </section>
      <aside className="right-column"><Inspector state={state} event={event} selected={selected} /><TeacherPanel /></aside>
    </div>
    <footer><span>Trace-backed lesson</span><span>•</span><span>JavaScript runs in a time-limited browser worker</span><span>•</span><span>Java & C++ adapters clearly report their current limitation</span></footer>
    {savedOpen && <SavedLessons close={() => setSavedOpen(false)} />}
  </main>;
}

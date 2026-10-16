import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import type * as Monaco from 'monaco-editor';
import { languageExample, useAppStore, useCurrentEvent } from '../store';

const languageName = { javascript: 'javascript', python: 'python', java: 'java', cpp: 'cpp' } as const;

export function CodeWorkspace({ onRun }: { onRun: () => void }) {
  const language = useAppStore((state) => state.language);
  const source = useAppStore((state) => state.source);
  const input = useAppStore((state) => state.input);
  const loading = useAppStore((state) => state.loading);
  const setLanguage = useAppStore((state) => state.setLanguage);
  const setSource = useAppStore((state) => state.setSource);
  const setInput = useAppStore((state) => state.setInput);
  const resetLesson = useAppStore((state) => state.resetLesson);
  const event = useCurrentEvent();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | undefined>(undefined);
  const decorations = useRef<Monaco.editor.IEditorDecorationsCollection | undefined>(undefined);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
    decorations.current = editor.createDecorationsCollection();
  };

  useEffect(() => {
    if (!decorations.current) return;
    const line = event?.source?.line;
    decorations.current.set(line ? [{ range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 }, options: { isWholeLine: true, className: 'executing-line', glyphMarginClassName: 'execution-glyph' } }] : []);
    if (line) editorRef.current?.revealLineInCenterIfOutsideViewport(line);
  }, [event?.id, event?.source?.line]);

  return <section className="panel code-panel">
    <div className="panel-title-row">
      <div><span className="eyebrow">Source workspace</span><h2>Code and test input</h2></div>
      <div className="language-actions"><select aria-label="Programming language" value={language} onChange={(event) => { setLanguage(event.target.value as typeof language); resetLesson(); }}>
        <option value="javascript">JavaScript</option><option value="python">Python</option><option value="java">Java · output trace</option><option value="cpp">C++ · output trace</option>
      </select><button className="example-button" onClick={() => { setSource(languageExample(language)); resetLesson(); }}>Load example</button></div>
    </div>
    <div className="editor-wrap">
      <Editor height="100%" language={languageName[language]} theme="vs-dark" value={source} onChange={(value) => setSource(value ?? '')} onMount={onMount}
        options={{ minimap: { enabled: false }, fontSize: 13, lineHeight: 21, padding: { top: 14 }, smoothScrolling: true, scrollBeyondLastLine: false, glyphMargin: true, automaticLayout: true, tabSize: 2 }} />
    </div>
    <label className="input-label" htmlFor="program-input">Standard input / test case</label>
    <textarea id="program-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Optional stdin passed to the program" rows={2} />
    <div className="code-actions">
      <button className="secondary" onClick={() => { resetLesson(); }}>New lesson</button>
      <button className="primary" disabled={loading || !source.trim()} onClick={onRun}>{loading ? 'Tracing safely…' : 'Run & teach'}</button>
    </div>
  </section>;
}

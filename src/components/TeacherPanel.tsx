import { useState } from 'react';
import { askTeacher } from '../services/api';
import { useAppStore, useCurrentEvent } from '../store';

const suggestions = ['Why did this variable change?', 'Explain this line more simply.', 'What is the difference from the previous state?', 'What would happen if this condition were false?'];

export function TeacherPanel() {
  const execution = useAppStore((state) => state.execution);
  const selected = useAppStore((state) => state.selectedObject);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asking, setAsking] = useState(false);
  const event = useCurrentEvent();
  const submit = async (value = question) => {
    if (!execution || !event || !value.trim()) return;
    setAsking(true);
    try { const result = await askTeacher(execution.id, event.id, value, selected); setAnswer(result.answer); } catch (error) { setAnswer(error instanceof Error ? error.message : 'The teacher could not answer right now.'); } finally { setAsking(false); }
  };
  return <section className="panel teacher-panel">
    <div className="panel-title-row"><div><span className="eyebrow">Contextual help</span><h2>Ask the teacher</h2></div></div>
    <p className="teacher-note">Answers receive the current source, event, selected object, and captured state. Counterfactuals request a separate run.</p>
    <div className="suggestions">{suggestions.map((item) => <button key={item} disabled={!event} onClick={() => { setQuestion(item); void submit(item); }}>{item}</button>)}</div>
    <div className="question-form"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void submit(); }} placeholder="Ask about this recorded step" disabled={!event} /><button onClick={() => void submit()} disabled={asking || !event}>{asking ? 'Thinking…' : 'Ask'}</button></div>
    {answer && <div className="teacher-answer">{answer}</div>}
  </section>;
}

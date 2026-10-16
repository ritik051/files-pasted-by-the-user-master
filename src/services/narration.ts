export interface NarrationAdapter {
  available(): boolean;
  speak(text: string, speed: number, volume: number, onEnd: () => void): void;
  pause(): void;
  resume(): void;
  cancel(): void;
}

/** Browser speech is the local default. Replace this adapter with an API-backed TTS adapter without changing timeline coordination. */
export class BrowserSpeechAdapter implements NarrationAdapter {
  available() { return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window; }
  speak(text: string, speed: number, volume: number, onEnd: () => void) {
    if (!this.available()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speed;
    utterance.volume = volume;
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
    window.speechSynthesis.speak(utterance);
  }
  pause() { window.speechSynthesis.pause(); }
  resume() { window.speechSynthesis.resume(); }
  cancel() { window.speechSynthesis.cancel(); }
}

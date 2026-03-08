export interface SpeechService {
  speak: (text: string) => void;
  isAvailable: () => boolean;
}

export function createBrowserSpeechService(): SpeechService {
  return {
    speak: (text: string) => {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    },
    isAvailable: () => 'speechSynthesis' in window
  };
}

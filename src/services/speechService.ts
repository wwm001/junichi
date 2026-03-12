export interface VoiceInfo {
  name: string;
  lang: string;
}

export interface SpeechService {
  init: () => Promise<void>;
  isSupported: () => boolean;
  isReady: () => boolean;
  isAvailable: () => boolean;
  speak: (text: string) => Promise<boolean>;
  getSelectedVoiceInfo: () => VoiceInfo | null;
}

const PREFERRED_VOICE_NAMES = ['Google US English', 'Google UK English', 'Samantha', 'Karen', 'Daniel'];

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const lowerName = voice.name.toLowerCase();
  const lowerLang = voice.lang.toLowerCase();

  let score = 0;
  if (lowerLang.startsWith('en')) score += 100;
  if (lowerLang === 'en-us') score += 40;
  if (lowerLang === 'en-gb') score += 30;
  if (voice.localService) score += 10;

  const preferredIndex = PREFERRED_VOICE_NAMES.findIndex((name) => lowerName.includes(name.toLowerCase()));
  if (preferredIndex !== -1) {
    score += 300 - preferredIndex * 20;
  }

  if (lowerName.includes('natural')) score += 20;
  if (lowerName.includes('premium')) score += 20;
  return score;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createBrowserSpeechService(): SpeechService {
  let initialized = false;
  let ready = false;
  let selectedVoice: SpeechSynthesisVoice | null = null;

  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;

  const pickBestVoice = (): SpeechSynthesisVoice | null => {
    if (!synth) return null;
    const voices = synth.getVoices();
    if (voices.length === 0) return null;

    const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
    const candidates = englishVoices.length > 0 ? englishVoices : voices;

    const best = [...candidates].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
    return best ?? null;
  };

  const waitForVoices = async (timeoutMs = 1500): Promise<void> => {
    if (!synth) return;

    if (synth.getVoices().length > 0) {
      selectedVoice = pickBestVoice();
      ready = true;
      return;
    }

    await new Promise<void>((resolve) => {
      const startedAt = Date.now();

      const cleanup = (): void => {
        synth.removeEventListener('voiceschanged', onVoicesChanged);
        clearInterval(intervalId);
      };

      const complete = (): void => {
        cleanup();
        selectedVoice = pickBestVoice();
        ready = selectedVoice !== null;
        resolve();
      };

      const onVoicesChanged = (): void => {
        if (synth.getVoices().length > 0) {
          complete();
        }
      };

      const intervalId = window.setInterval(() => {
        if (synth.getVoices().length > 0 || Date.now() - startedAt >= timeoutMs) {
          complete();
        }
      }, 100);

      synth.addEventListener('voiceschanged', onVoicesChanged);
    });
  };

  const unlockOnFirstInteraction = async (): Promise<void> => {
    if (!synth) return;

    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(' ');
      utterance.volume = 0;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      try {
        synth.cancel();
        synth.resume();
        synth.speak(utterance);

        window.setTimeout(() => {
          synth.cancel();
          resolve();
        }, 120);
      } catch {
        resolve();
      }
    });
  };

  const speakOnce = async (text: string): Promise<boolean> => {
    if (!synth) return false;

    return new Promise<boolean>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = selectedVoice ?? pickBestVoice();

      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = 'en-US';
      }

      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.volume = 1;

      let started = false;
      const failTimerId = window.setTimeout(() => {
        if (!started) {
          synth.cancel();
          resolve(false);
        }
      }, 1200);

      utterance.onstart = () => {
        started = true;
      };

      utterance.onend = () => {
        clearTimeout(failTimerId);
        resolve(true);
      };

      utterance.onerror = () => {
        clearTimeout(failTimerId);
        resolve(false);
      };

      try {
        synth.cancel();
        synth.resume();
        synth.speak(utterance);
      } catch {
        clearTimeout(failTimerId);
        resolve(false);
      }
    });
  };

  return {
    init: async () => {
      if (!synth) return;
      if (!initialized) {
        initialized = true;
        await unlockOnFirstInteraction();
      }

      await waitForVoices();
      if (!selectedVoice) {
        selectedVoice = pickBestVoice();
      }
      ready = selectedVoice !== null || synth.getVoices().length > 0;
    },
    isSupported: () => synth !== null,
    isReady: () => ready,
    isAvailable: () => synth !== null,
    speak: async (text: string) => {
      if (!synth) return false;

      if (!initialized) {
        await unlockOnFirstInteraction();
        initialized = true;
      }

      if (!ready) {
        await waitForVoices();
      }

      const firstTry = await speakOnce(text);
      if (firstTry) {
        return true;
      }

      await wait(220);
      await waitForVoices(1800);
      return speakOnce(text);
    },
    getSelectedVoiceInfo: () => {
      const voice = selectedVoice ?? pickBestVoice();
      if (!voice) return null;
      return { name: voice.name, lang: voice.lang };
    }
  };
}

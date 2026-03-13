export interface SpeechVoiceInfo {
  name: string;
  lang: string;
}

export interface SpeechService {
  init: () => void;
  speak: (text: string) => void;
  stop: () => void;
  isAvailable: () => boolean;
  isReady: () => boolean;
  isSpeaking: () => boolean;
  getSelectedVoiceInfo: () => SpeechVoiceInfo | null;
  getLastError: () => string | null;
}

const PREFERRED_VOICE_NAMES = [
  'google us english',
  'google uk english',
  'samantha',
  'karen',
  'daniel',
  'alex',
  'victoria'
];

const FAILURE_MESSAGE =
  'この端末では音声再生の初期化に失敗しました。もう一度タップしてください。Chrome の利用もお試しください。';

const VOICE_WAIT_TIMEOUT_MS = 1200;
const START_DETECT_TIMEOUT_MS = 900;
const RETRY_DELAY_MS = 180;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function isSpeechSupported(): boolean {
  return isBrowser() && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isEnglishVoice(voice: SpeechSynthesisVoice): boolean {
  return normalize(voice.lang).startsWith('en');
}

function scoreVoice(voice: SpeechSynthesisVoice): number {
  const name = normalize(voice.name);
  const lang = normalize(voice.lang);
  let score = 0;

  if (lang.startsWith('en-us')) score += 50;
  else if (lang.startsWith('en-gb')) score += 45;
  else if (lang.startsWith('en')) score += 40;

  for (let i = 0; i < PREFERRED_VOICE_NAMES.length; i += 1) {
    if (name.includes(PREFERRED_VOICE_NAMES[i])) {
      score += 100 - i;
      break;
    }
  }

  if (voice.default) score += 10;

  return score;
}

function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  const englishVoices = voices.filter(isEnglishVoice);
  if (englishVoices.length === 0) return null;

  return [...englishVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? null;
}

export function createBrowserSpeechService(): SpeechService {
  let initialized = false;
  let ready = false;
  let lastError: string | null = null;
  let selectedVoice: SpeechSynthesisVoice | null = null;
  let voicesCache: SpeechSynthesisVoice[] = [];
  let activeUtterance: SpeechSynthesisUtterance | null = null;
  let voicesChangedAttached = false;
  let speakAttemptId = 0;

  const getSynth = (): SpeechSynthesis | null => {
    if (!isSpeechSupported()) return null;
    return window.speechSynthesis;
  };

  const refreshVoices = (): SpeechSynthesisVoice[] => {
    const synth = getSynth();
    if (!synth) {
      voicesCache = [];
      selectedVoice = null;
      ready = false;
      return voicesCache;
    }

    voicesCache = synth.getVoices();
    selectedVoice = pickBestVoice(voicesCache);
    ready = true;

    return voicesCache;
  };

  const attachVoicesChanged = (): void => {
    const synth = getSynth();
    if (!synth || voicesChangedAttached) return;

    synth.addEventListener('voiceschanged', () => {
      refreshVoices();
    });

    voicesChangedAttached = true;
  };

  const waitForVoices = (timeoutMs = VOICE_WAIT_TIMEOUT_MS): Promise<void> => {
    return new Promise((resolve) => {
      if (!isSpeechSupported()) {
        resolve();
        return;
      }

      refreshVoices();
      if (voicesCache.length > 0) {
        resolve();
        return;
      }

      const startedAt = Date.now();

      const poll = (): void => {
        refreshVoices();

        if (voicesCache.length > 0) {
          resolve();
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          resolve();
          return;
        }

        window.setTimeout(poll, 80);
      };

      poll();
    });
  };

  const softResetSynth = (): void => {
    const synth = getSynth();
    if (!synth) return;

    try {
      synth.cancel();
    } catch {
      // no-op
    }

    try {
      synth.resume();
    } catch {
      // no-op
    }

    activeUtterance = null;
  };

  const buildUtterance = (text: string): SpeechSynthesisUtterance => {
    const utterance = new SpeechSynthesisUtterance(text);

    const voice = selectedVoice ?? pickBestVoice(refreshVoices());

    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-US';
    }

    utterance.rate = 0.92;
    utterance.pitch = 1;
    utterance.volume = 1;

    return utterance;
  };

  const finalizeUtterance = (utterance: SpeechSynthesisUtterance): void => {
    if (activeUtterance === utterance) {
      activeUtterance = null;
    }
  };

  const trySpeakNow = (text: string, allowRetry: boolean, attemptId: number): void => {
    const synth = getSynth();

    if (!synth) {
      lastError = FAILURE_MESSAGE;
      return;
    }

    softResetSynth();

    const utterance = buildUtterance(text);
    activeUtterance = utterance;

    let didStart = false;

    utterance.onstart = () => {
      if (attemptId !== speakAttemptId) return;
      didStart = true;
      lastError = null;
    };

    utterance.onend = () => {
      finalizeUtterance(utterance);
    };

    utterance.onerror = () => {
      finalizeUtterance(utterance);

      if (attemptId !== speakAttemptId) return;

      lastError = FAILURE_MESSAGE;

      if (allowRetry) {
        window.setTimeout(() => {
          if (attemptId !== speakAttemptId) return;
          void speakInternal(text, false);
        }, RETRY_DELAY_MS);
      }
    };

    try {
      synth.speak(utterance);
    } catch {
      finalizeUtterance(utterance);
      lastError = FAILURE_MESSAGE;

      if (allowRetry) {
        window.setTimeout(() => {
          if (attemptId !== speakAttemptId) return;
          void speakInternal(text, false);
        }, RETRY_DELAY_MS);
      }
      return;
    }

    window.setTimeout(() => {
      if (attemptId !== speakAttemptId) return;

      const idle = !didStart && !synth.speaking && !synth.pending;
      if (!idle) return;

      finalizeUtterance(utterance);
      lastError = FAILURE_MESSAGE;

      if (allowRetry) {
        void speakInternal(text, false);
      }
    }, START_DETECT_TIMEOUT_MS);
  };

  const speakInternal = async (text: string, allowRetry: boolean): Promise<void> => {
    if (!text.trim()) return;

    const synth = getSynth();
    if (!synth) {
      lastError = FAILURE_MESSAGE;
      return;
    }

    const attemptId = ++speakAttemptId;

    await waitForVoices();

    if (attemptId !== speakAttemptId) return;

    refreshVoices();

    window.setTimeout(() => {
      if (attemptId !== speakAttemptId) return;
      trySpeakNow(text, allowRetry, attemptId);
    }, 30);
  };

  const init = (): void => {
    if (!isSpeechSupported()) {
      lastError = FAILURE_MESSAGE;
      return;
    }

    attachVoicesChanged();
    refreshVoices();
    softResetSynth();

    initialized = true;

    void waitForVoices().then(() => {
      refreshVoices();
    });
  };

  return {
    init: () => {
      init();
    },

    speak: (text: string) => {
      if (!isSpeechSupported()) {
        lastError = FAILURE_MESSAGE;
        return;
      }

      lastError = null;

      if (!initialized) {
        init();
      } else {
        refreshVoices();
      }

      void speakInternal(text, true);
    },

    stop: () => {
      softResetSynth();
    },

    isAvailable: () => {
      return isSpeechSupported();
    },

    isReady: () => {
      if (!isSpeechSupported()) return false;
      refreshVoices();
      return ready;
    },

    isSpeaking: () => {
      const synth = getSynth();
      if (!synth) return false;
      return synth.speaking || synth.pending || activeUtterance !== null;
    },

    getSelectedVoiceInfo: () => {
      refreshVoices();

      if (!selectedVoice) return null;

      return {
        name: selectedVoice.name,
        lang: selectedVoice.lang
      };
    },

    getLastError: () => {
      return lastError;
    }
  };
}

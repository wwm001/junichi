export interface SpeechVoiceInfo {
  name: string;
  lang: string;
}

export interface SpeechService {
  init: () => void;
  speak: (text: string) => void;
  isAvailable: () => boolean;
  isReady: () => boolean;
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

const RETRY_DELAY_MS = 250;
const START_CHECK_DELAY_MS = 220;
const VOICE_WAIT_TIMEOUT_MS = 1500;
const FAILURE_MESSAGE =
  'この端末では音声再生の初期化に失敗しました。もう一度タップしてください。';

function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isEnglishVoice(voice: SpeechSynthesisVoice): boolean {
  return normalize(voice.lang).startsWith('en');
}

function scoreVoice(voice: SpeechSynthesisVoice): number {
  let score = 0;
  const name = normalize(voice.name);
  const lang = normalize(voice.lang);

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
  let retryTimer: number | null = null;
  let voiceWaitTimer: number | null = null;
  let voicesChangedAttached = false;

  const getSynth = (): SpeechSynthesis | null => {
    if (!isSpeechSupported()) return null;
    return window.speechSynthesis;
  };

  const clearRetry = (): void => {
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const clearVoiceWaitTimer = (): void => {
    if (voiceWaitTimer !== null) {
      window.clearTimeout(voiceWaitTimer);
      voiceWaitTimer = null;
    }
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
    ready = voicesCache.length > 0;

    return voicesCache;
  };

  const attachVoicesChanged = (): void => {
    const synth = getSynth();
    if (!synth || voicesChangedAttached) return;

    const handleVoicesChanged = (): void => {
      refreshVoices();
    };

    synth.addEventListener('voiceschanged', handleVoicesChanged);
    voicesChangedAttached = true;
  };

  const waitForVoices = (): void => {
    if (!isSpeechSupported()) return;

    refreshVoices();
    if (voicesCache.length > 0) return;

    clearVoiceWaitTimer();

    const startedAt = Date.now();

    const poll = (): void => {
      refreshVoices();
      if (voicesCache.length > 0) {
        clearVoiceWaitTimer();
        return;
      }

      if (Date.now() - startedAt >= VOICE_WAIT_TIMEOUT_MS) {
        clearVoiceWaitTimer();
        return;
      }

      voiceWaitTimer = window.setTimeout(poll, 100);
    };

    poll();
  };

  const unlockIfNeeded = (): void => {
    const synth = getSynth();
    if (!synth) return;

    try {
      synth.cancel();
      synth.resume();

      const warmup = new SpeechSynthesisUtterance(' ');
      warmup.volume = 0;
      warmup.rate = 1;
      warmup.pitch = 1;

      const voice = selectedVoice ?? pickBestVoice(refreshVoices());
      if (voice) {
        warmup.voice = voice;
        warmup.lang = voice.lang;
      } else {
        warmup.lang = 'en-US';
      }

      synth.speak(warmup);

      window.setTimeout(() => {
        try {
          synth.cancel();
          synth.resume();
        } catch {
          // no-op
        }
      }, 0);
    } catch {
      // no-op
    }
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

    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;

    return utterance;
  };

  const attemptSpeak = (text: string, allowRetry: boolean): void => {
    const synth = getSynth();
    if (!synth) {
      lastError = FAILURE_MESSAGE;
      return;
    }

    let started = false;
    const utterance = buildUtterance(text);

    utterance.onstart = () => {
      started = true;
      lastError = null;
    };

    utterance.onerror = () => {
      lastError = FAILURE_MESSAGE;
      if (allowRetry) {
        scheduleRetry(text, false);
      }
    };

    try {
      synth.cancel();
      synth.resume();
      synth.speak(utterance);
    } catch {
      lastError = FAILURE_MESSAGE;
      if (allowRetry) {
        scheduleRetry(text, false);
      }
      return;
    }

    if (allowRetry) {
      window.setTimeout(() => {
        const stillIdle = !started && !synth.speaking && !synth.pending;
        if (stillIdle) {
          lastError = FAILURE_MESSAGE;
          scheduleRetry(text, false);
        }
      }, START_CHECK_DELAY_MS);
    }
  };

  const scheduleRetry = (text: string, allowRetry: boolean): void => {
    clearRetry();
    retryTimer = window.setTimeout(() => {
      refreshVoices();
      attemptSpeak(text, allowRetry);
    }, RETRY_DELAY_MS);
  };

  const init = (): void => {
    if (!isSpeechSupported()) {
      lastError = FAILURE_MESSAGE;
      return;
    }

    if (!initialized) {
      attachVoicesChanged();
      refreshVoices();
      waitForVoices();
      unlockIfNeeded();
      initialized = true;
      return;
    }

    refreshVoices();
  };

  return {
    init: () => {
      init();
    },

    speak: (text: string) => {
      if (!text.trim()) return;

      clearRetry();
      init();
      attemptSpeak(text, true);
    },

    isAvailable: () => {
      return isSpeechSupported();
    },

    isReady: () => {
      refreshVoices();
      return ready;
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

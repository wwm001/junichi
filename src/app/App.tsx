import { useCallback, useEffect, useMemo, useState } from 'react';
import vocabularyJson from '../data/vocabulary.json';
import { ProgressPanel } from '../components/ProgressPanel';
import { QuizCard } from '../components/QuizCard';
import { buildQuestion, computeAccuracy, selectNextItem } from '../domain/quiz';
import { createInitialProgress, isDue, updateProgress } from '../domain/spacedRepetition';
import type { AppProgress, ReviewRating, VocabularyItem } from '../domain/types';
import { createBrowserSpeechService } from '../services/speechService';
import { createBrowserProgressStorage } from '../storage/progressStorage';

const vocabulary = vocabularyJson as VocabularyItem[];
const speechService = createBrowserSpeechService();
const progressStorage = createBrowserProgressStorage();
const appBuildVersion = __APP_VERSION__;

export function App(): JSX.Element {
  const [progress, setProgress] = useState<AppProgress>(() => progressStorage.load());
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [speechStatusMessage, setSpeechStatusMessage] = useState<string | null>(null);
  const [speechReady, setSpeechReady] = useState<boolean>(speechService.isReady());
  const [voiceDebugLabel, setVoiceDebugLabel] = useState<string | null>(null);

  const currentItem = useMemo(() => selectNextItem(vocabulary, progress), [progress]);
  const question = useMemo(() => buildQuestion(currentItem), [currentItem]);

  const speechAvailable = speechService.isAvailable();

  const syncSpeechUi = useCallback((): void => {
    setSpeechReady(speechService.isReady());

    const voice = speechService.getSelectedVoiceInfo();
    if (import.meta.env.DEV && voice) {
      setVoiceDebugLabel(`${voice.name} (${voice.lang})`);
    } else {
      setVoiceDebugLabel(null);
    }

    setSpeechStatusMessage(speechService.getLastError());
  }, []);

  useEffect(() => {
    syncSpeechUi();
  }, [syncSpeechUi]);

  useEffect(() => {
    setSpeechStatusMessage(null);
    syncSpeechUi();
  }, [currentItem.id, syncSpeechUi]);

  const dueCount = useMemo(() => {
    const now = new Date();

    return vocabulary.filter((item) => {
      const entry = progress.entries[item.id] ?? createInitialProgress(item.id, now);
      return isDue(entry, now);
    }).length;
  }, [progress]);

  const onChoice = (choice: string): void => {
    setSelectedChoice(choice);
    setShowResult(true);
  };

  const onRate = (rating: ReviewRating): void => {
    const now = new Date();
    const currentEntry = progress.entries[currentItem.id] ?? createInitialProgress(currentItem.id, now);
    const updatedEntry = updateProgress(currentEntry, rating, now);

    const isCorrect = selectedChoice === currentItem.meaningJa;

    const nextProgress: AppProgress = {
      entries: {
        ...progress.entries,
        [currentItem.id]: updatedEntry
      },
      totalAnswered: progress.totalAnswered + 1,
      totalCorrect: progress.totalCorrect + (isCorrect ? 1 : 0)
    };

    progressStorage.save(nextProgress);
    setProgress(nextProgress);
    setSelectedChoice(null);
    setShowResult(false);
    setSpeechStatusMessage(null);
  };

  const onSpeak = (): void => {
    if (!speechAvailable) {
      setSpeechStatusMessage(
        'この端末では音声再生が利用できないか、ブラウザ制限がかかっています。通常ブラウザで再読み込みして再試行してください。'
      );
      return;
    }

    setSpeechStatusMessage(null);

    speechService.init();
    speechService.speak(question.item.word);

    syncSpeechUi();

    window.setTimeout(syncSpeechUi, 150);
    window.setTimeout(syncSpeechUi, 450);
    window.setTimeout(syncSpeechUi, 900);
  };

  return (
    <main className="app-shell">
      <h1>英検準一級合格アプリ準一 (JUNICHI)</h1>
      <p className="subtitle">短時間で語彙を反復学習できるモバイル向けPWA</p>

      <QuizCard
        question={question}
        selectedChoice={selectedChoice}
        showResult={showResult}
        onChoice={onChoice}
        onRate={onRate}
        onSpeak={onSpeak}
        speechAvailable={speechAvailable}
        speechReady={speechReady}
        speechStatusMessage={speechStatusMessage}
        voiceDebugLabel={voiceDebugLabel}
      />

      <ProgressPanel
        totalAnswered={progress.totalAnswered}
        totalCorrect={progress.totalCorrect}
        accuracy={computeAccuracy(progress)}
        dueCount={dueCount}
      />

      <p className="build-version">build: {appBuildVersion}</p>
    </main>
  );
}

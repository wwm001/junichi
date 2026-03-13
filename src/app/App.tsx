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
  const [speechPlaying, setSpeechPlaying] = useState<boolean>(speechService.isSpeaking());
  const [voiceDebugLabel, setVoiceDebugLabel] = useState<string | null>(null);

  const currentItem = useMemo(() => selectNextItem(vocabulary, progress), [progress]);
  const question = useMemo(() => buildQuestion(currentItem), [currentItem]);

  const speechAvailable = speechService.isAvailable();
  const totalItems = vocabulary.length;

  const syncSpeechUi = useCallback((): void => {
    setSpeechReady(speechService.isReady());
    setSpeechPlaying(speechService.isSpeaking());

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

  const reviewedCount = Object.keys(progress.entries).length;

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
    setSpeechPlaying(false);
  };

  const onSpeak = (): void => {
    if (!speechAvailable) {
      setSpeechStatusMessage(
        'このブラウザでは音声再生が利用できない可能性があります。Android では Chrome の利用を推奨します。'
      );
      setSpeechPlaying(false);
      return;
    }

    setSpeechStatusMessage(null);
    setSpeechPlaying(false);

    speechService.init();
    speechService.speak(question.item.word);

    syncSpeechUi();

    window.setTimeout(syncSpeechUi, 80);
    window.setTimeout(syncSpeechUi, 180);
    window.setTimeout(syncSpeechUi, 450);
    window.setTimeout(syncSpeechUi, 900);
    window.setTimeout(syncSpeechUi, 1500);
  };

  const answerStatus = showResult
    ? selectedChoice === currentItem.meaningJa
      ? 'correct'
      : 'wrong'
    : 'idle';

  return (
    <main className="app-shell">
      <header className="hero card">
        <p className="eyebrow">英検準一級 語彙トレーニング</p>
        <h1>準一 JUNICHI</h1>
        <p className="subtitle">音声で出題、4択で回答。短時間で語彙を反復学習できるモバイル向けPWAです。</p>
        <div className="hero-meta" aria-label="学習状況の概要">
          <span>{totalItems}語収録</span>
          <span>{dueCount}語が復習対象</span>
          <span>{progress.totalAnswered}問回答</span>
        </div>
        <p className="environment-note">推奨ブラウザ: Google Chrome（Android）</p>
      </header>

      <QuizCard
        question={question}
        selectedChoice={selectedChoice}
        showResult={showResult}
        onChoice={onChoice}
        onRate={onRate}
        onSpeak={onSpeak}
        speechAvailable={speechAvailable}
        speechReady={speechReady}
        speechPlaying={speechPlaying}
        speechStatusMessage={speechStatusMessage}
        voiceDebugLabel={voiceDebugLabel}
        answerStatus={answerStatus}
      />

      <ProgressPanel
        totalAnswered={progress.totalAnswered}
        totalCorrect={progress.totalCorrect}
        accuracy={computeAccuracy(progress)}
        dueCount={dueCount}
        reviewedCount={reviewedCount}
        totalItems={totalItems}
      />

      <p className="build-version">build {appBuildVersion}</p>
    </main>
  );
}

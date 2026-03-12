import { useMemo, useState } from 'react';
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

const SPEECH_ERROR_MESSAGE = 'この端末では音声再生の初期化に失敗しました。もう一度タップしてください。';

export function App(): JSX.Element {
  const [progress, setProgress] = useState<AppProgress>(() => progressStorage.load());
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechReady, setSpeechReady] = useState(speechService.isReady());
  const [voiceInfoLabel, setVoiceInfoLabel] = useState<string | null>(null);

  const currentItem = useMemo(() => selectNextItem(vocabulary, progress), [progress]);
  const question = useMemo(() => buildQuestion(currentItem), [currentItem]);

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

  const onSpeak = async (): Promise<void> => {
    setSpeechError(null);

    await speechService.init();
    const ok = await speechService.speak(question.item.word);
    setSpeechReady(speechService.isReady());

    const voiceInfo = speechService.getSelectedVoiceInfo();
    setVoiceInfoLabel(voiceInfo ? `${voiceInfo.name} (${voiceInfo.lang})` : null);

    if (!ok) {
      setSpeechError(SPEECH_ERROR_MESSAGE);
    }
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
        speechAvailable={speechService.isAvailable()}
        speechReady={speechReady}
        speechError={speechError}
        debugVoiceLabel={import.meta.env.DEV ? voiceInfoLabel : null}
      />

      <ProgressPanel
        totalAnswered={progress.totalAnswered}
        totalCorrect={progress.totalCorrect}
        accuracy={computeAccuracy(progress)}
        dueCount={dueCount}
      />
    </main>
  );
}

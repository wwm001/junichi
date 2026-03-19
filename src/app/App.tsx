import { useCallback, useEffect, useMemo, useState } from 'react';
import questionsJson from '../data/questions.json';
import { buildNextActionLabel, buildProgressSummary, buildWeaknessHint, computeRankInfo, finalizeLearningState, getRecommendedDifficulty, isMockTestUnlocked, updateQuestionProgress } from '../domain/learning';
import { formatCountdown, getQuestionsBySection, selectMockTestQuestions, selectTrainingQuestions } from '../domain/questionBank';
import type { AppProgress, Difficulty, LearningState, Question, RankInfo, SessionRecord, SessionSummary, TestRecord } from '../domain/types';
import { createBrowserSpeechService } from '../services/speechService';
import { createBrowserLearningStorage, emptyLearningState } from '../storage/learningStorage';

const questionBank = questionsJson as Question[];
const speechService = createBrowserSpeechService();
const learningStorage = createBrowserLearningStorage();
const appBuildVersion = __APP_VERSION__;

const TRAINING_TIME_LIMIT_SECONDS = 5 * 60;
const MOCK_TIME_LIMIT_SECONDS = 18 * 60;
const TRAINING_PRACTICE_COUNT = 6;
const TRAINING_MINI_TEST_COUNT = 3;
const MOCK_QUESTION_COUNT = 18;

type Screen = 'home' | 'training-select' | 'training-session' | 'training-result' | 'mock-intro' | 'mock-session' | 'mock-result' | 'status';
type TrainingPhase = 'practice' | 'mini-test';

interface AnswerRecord {
  questionId: string;
  selectedIndex: number;
  isCorrect: boolean;
}

interface TrainingRuntime {
  id: string;
  difficulty: Difficulty;
  practiceQuestions: Question[];
  miniTestQuestions: Question[];
  phase: TrainingPhase;
  currentIndex: number;
  answers: AnswerRecord[];
  progressSnapshot: AppProgress;
  remainingSeconds: number;
}

interface MockRuntime {
  id: string;
  questions: Question[];
  currentIndex: number;
  answers: AnswerRecord[];
  progressSnapshot: AppProgress;
  remainingSeconds: number;
}

interface TrainingResultPayload {
  summary: SessionSummary;
  sessionRecord: SessionRecord;
  miniTestRecord: TestRecord;
  rankInfo: RankInfo;
}

interface MockResultPayload {
  sessionRecord: SessionRecord;
  mockRecord: TestRecord;
  rankInfo: RankInfo;
  wrongQuestions: Question[];
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function difficultyLabel(value: Difficulty): string {
  return value === 'basic' ? '基礎' : value === 'standard' ? '標準' : '実戦';
}

function sectionLabel(section: Question['section']): string {
  switch (section) {
    case 'vocab-gap': return '語彙補充';
    case 'long-gap': return '長文語句補充';
    case 'reading': return '長文読解';
    case 'summary': return '要約';
    case 'writing': return '英作文';
    case 'listening': return 'リスニング';
  }
}

function buildSpeechText(question: Question): string {
  return question.audioText ?? question.prompt.replace('____', question.choices[question.answerIndex]);
}

function countCorrectAnswers(answers: AnswerRecord[]): number {
  return answers.filter((answer) => answer.isCorrect).length;
}

function formatPercent(value: number): string {
  return `${value}%`;
}

export function App(): JSX.Element {
  const [learningState, setLearningState] = useState<LearningState>(() => learningStorage.load());
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(() => getRecommendedDifficulty(learningStorage.load()));
  const [trainingRuntime, setTrainingRuntime] = useState<TrainingRuntime | null>(null);
  const [mockRuntime, setMockRuntime] = useState<MockRuntime | null>(null);
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number | null>(null);
  const [showTrainingFeedback, setShowTrainingFeedback] = useState(false);
  const [speechStatusMessage, setSpeechStatusMessage] = useState<string | null>(null);
  const [speechReady, setSpeechReady] = useState<boolean>(speechService.isReady());
  const [speechPlaying, setSpeechPlaying] = useState<boolean>(speechService.isSpeaking());
  const [voiceDebugLabel, setVoiceDebugLabel] = useState<string | null>(null);
  const [resetStatusMessage, setResetStatusMessage] = useState<string | null>(null);
  const [lastTrainingResult, setLastTrainingResult] = useState<TrainingResultPayload | null>(null);
  const [lastMockResult, setLastMockResult] = useState<MockResultPayload | null>(null);

  const vocabQuestions = useMemo(() => getQuestionsBySection(questionBank, 'vocab-gap'), []);
  const rankInfo = useMemo(() => computeRankInfo(learningState), [learningState]);
  const dueCount = useMemo(() => Object.values(learningState.progress.entries).filter((entry) => new Date(entry.dueAt).getTime() <= Date.now()).length, [learningState.progress.entries]);
  const recommendedDifficulty = useMemo(() => getRecommendedDifficulty(learningState), [learningState]);
  const nextActionLabel = useMemo(() => buildNextActionLabel(learningState), [learningState]);
  const weaknessHint = useMemo(() => buildWeaknessHint(vocabQuestions, learningState), [vocabQuestions, learningState]);
  const mockUnlocked = useMemo(() => isMockTestUnlocked(learningState), [learningState]);
  const latestMiniTest = learningState.miniTests[learningState.miniTests.length - 1] ?? null;
  const latestMockTest = learningState.mockTests[learningState.mockTests.length - 1] ?? null;

  const currentTrainingQuestion = useMemo(() => {
    if (!trainingRuntime) return null;
    return trainingRuntime.phase === 'practice' ? trainingRuntime.practiceQuestions[trainingRuntime.currentIndex] ?? null : trainingRuntime.miniTestQuestions[trainingRuntime.currentIndex] ?? null;
  }, [trainingRuntime]);
  const currentMockQuestion = useMemo(() => mockRuntime ? mockRuntime.questions[mockRuntime.currentIndex] ?? null : null, [mockRuntime]);

  const syncSpeechUi = useCallback((): void => {
    setSpeechReady(speechService.isReady());
    setSpeechPlaying(speechService.isSpeaking());
    const voice = speechService.getSelectedVoiceInfo();
    if (import.meta.env.DEV && voice) setVoiceDebugLabel(`${voice.name} (${voice.lang})`); else setVoiceDebugLabel(null);
    setSpeechStatusMessage(speechService.getLastError());
  }, []);

  const finalizeTrainingSession = useCallback((reason: 'completed' | 'time-up', runtimeOverride?: TrainingRuntime): void => {
    const runtime = runtimeOverride ?? trainingRuntime;
    if (!runtime) return;
    const practiceIds = new Set(runtime.practiceQuestions.map((question) => question.id));
    const practiceAnswers = runtime.answers.filter((answer) => practiceIds.has(answer.questionId));
    const miniAnswers = runtime.answers.filter((answer) => !practiceIds.has(answer.questionId));
    const practiceCorrect = countCorrectAnswers(practiceAnswers);
    const miniCorrect = countCorrectAnswers(miniAnswers);
    const nowIso = new Date().toISOString();
    const durationSeconds = TRAINING_TIME_LIMIT_SECONDS - runtime.remainingSeconds;
    const answeredCount = runtime.answers.length;
    const summary: SessionSummary = {
      sessionId: runtime.id,
      difficulty: runtime.difficulty,
      practiceCorrect,
      practiceTotal: runtime.practiceQuestions.length,
      miniCorrect,
      miniTotal: runtime.miniTestQuestions.length,
      overallAccuracy: answeredCount === 0 ? 0 : Math.round(((practiceCorrect + miniCorrect) / answeredCount) * 100),
      durationSeconds,
      completedAt: nowIso
    };
    const sessionRecord: SessionRecord = { id: runtime.id, mode: 'training', section: 'vocab-gap', difficulty: runtime.difficulty, totalQuestions: answeredCount, correctAnswers: practiceCorrect + miniCorrect, accuracy: summary.overallAccuracy, durationSeconds, completedAt: nowIso };
    const miniTestRecord: TestRecord = { id: `${runtime.id}-mini`, type: 'mini-test', section: 'vocab-gap', totalQuestions: miniAnswers.length, correctAnswers: miniCorrect, accuracy: miniAnswers.length === 0 ? 0 : Math.round((miniCorrect / miniAnswers.length) * 100), durationSeconds, completedAt: nowIso };
    const nextState = finalizeLearningState(learningState, { progress: runtime.progressSnapshot, addSession: sessionRecord, addMiniTest: miniTestRecord });
    learningStorage.save(nextState);
    setLearningState(nextState);
    setSelectedDifficulty(runtime.difficulty);
    setTrainingRuntime(null);
    setLastTrainingResult({ summary, sessionRecord, miniTestRecord, rankInfo: computeRankInfo(nextState) });
    setScreen('training-result');
    if (reason === 'time-up') setResetStatusMessage('5分経過。ここまでの結果でセッションを保存しました。');
  }, [learningState, trainingRuntime]);

  const finalizeMockTest = useCallback((reason: 'completed' | 'time-up', runtimeOverride?: MockRuntime): void => {
    const runtime = runtimeOverride ?? mockRuntime;
    if (!runtime) return;
    const correctAnswers = countCorrectAnswers(runtime.answers);
    const accuracy = runtime.answers.length === 0 ? 0 : Math.round((correctAnswers / runtime.answers.length) * 100);
    const nowIso = new Date().toISOString();
    const durationSeconds = MOCK_TIME_LIMIT_SECONDS - runtime.remainingSeconds;
    const sessionRecord: SessionRecord = { id: runtime.id, mode: 'mock-test', section: 'vocab-gap', totalQuestions: runtime.answers.length, correctAnswers, accuracy, durationSeconds, completedAt: nowIso };
    const mockRecord: TestRecord = { id: `${runtime.id}-mock`, type: 'mock-test', section: 'vocab-gap', totalQuestions: runtime.answers.length, correctAnswers, accuracy, durationSeconds, completedAt: nowIso };
    const wrongIds = new Set(runtime.answers.filter((answer) => !answer.isCorrect).map((answer) => answer.questionId));
    const nextState = finalizeLearningState(learningState, { progress: runtime.progressSnapshot, addSession: sessionRecord, addMockTest: mockRecord });
    learningStorage.save(nextState);
    setLearningState(nextState);
    setMockRuntime(null);
    setLastMockResult({ sessionRecord, mockRecord, rankInfo: computeRankInfo(nextState), wrongQuestions: runtime.questions.filter((question) => wrongIds.has(question.id)) });
    setScreen('mock-result');
    if (reason === 'time-up') setResetStatusMessage('疑似テスト時間終了。ここまでの解答で採点しました。');
  }, [learningState, mockRuntime]);

  useEffect(() => { syncSpeechUi(); }, [syncSpeechUi]);
  useEffect(() => { if (!resetStatusMessage) return undefined; const timeoutId = window.setTimeout(() => setResetStatusMessage(null), 2800); return () => window.clearTimeout(timeoutId); }, [resetStatusMessage]);
  useEffect(() => { if (screen !== 'training-session' || !trainingRuntime || trainingRuntime.remainingSeconds <= 0) return undefined; const timerId = window.setTimeout(() => { setTrainingRuntime((current) => { if (!current) return current; const nextRemaining = current.remainingSeconds - 1; if (nextRemaining <= 0) { window.setTimeout(() => finalizeTrainingSession('time-up'), 0); return { ...current, remainingSeconds: 0 }; } return { ...current, remainingSeconds: nextRemaining }; }); }, 1000); return () => window.clearTimeout(timerId); }, [screen, trainingRuntime, finalizeTrainingSession]);
  useEffect(() => { if (screen !== 'mock-session' || !mockRuntime || mockRuntime.remainingSeconds <= 0) return undefined; const timerId = window.setTimeout(() => { setMockRuntime((current) => { if (!current) return current; const nextRemaining = current.remainingSeconds - 1; if (nextRemaining <= 0) { window.setTimeout(() => finalizeMockTest('time-up'), 0); return { ...current, remainingSeconds: 0 }; } return { ...current, remainingSeconds: nextRemaining }; }); }, 1000); return () => window.clearTimeout(timerId); }, [screen, mockRuntime, finalizeMockTest]);
  useEffect(() => { setSpeechStatusMessage(null); syncSpeechUi(); }, [currentTrainingQuestion?.id, currentMockQuestion?.id, syncSpeechUi]);

  const onSpeak = (question: Question | null): void => {
    if (!question) return;
    if (!speechService.isAvailable()) { setSpeechStatusMessage('このブラウザでは音声再生が利用できない可能性があります。Chrome の利用を推奨します。'); setSpeechPlaying(false); return; }
    setSpeechStatusMessage(null); setSpeechPlaying(false); speechService.init(); speechService.speak(buildSpeechText(question)); syncSpeechUi();
    window.setTimeout(syncSpeechUi, 80); window.setTimeout(syncSpeechUi, 180); window.setTimeout(syncSpeechUi, 450); window.setTimeout(syncSpeechUi, 900); window.setTimeout(syncSpeechUi, 1500);
  };

  const startTraining = (difficulty: Difficulty): void => {
    const { practiceQuestions, miniTestQuestions } = selectTrainingQuestions({ questions: vocabQuestions, difficulty, progress: learningState.progress, practiceCount: TRAINING_PRACTICE_COUNT, miniTestCount: TRAINING_MINI_TEST_COUNT });
    setTrainingRuntime({ id: createId('training'), difficulty, practiceQuestions, miniTestQuestions, phase: 'practice', currentIndex: 0, answers: [], progressSnapshot: learningState.progress, remainingSeconds: TRAINING_TIME_LIMIT_SECONDS });
    setSelectedChoiceIndex(null); setShowTrainingFeedback(false); setLastTrainingResult(null); setScreen('training-session');
  };

  const startMockTest = (): void => {
    if (!mockUnlocked) return;
    const questions = selectMockTestQuestions({ questions: questionBank, section: 'vocab-gap', count: MOCK_QUESTION_COUNT, progress: learningState.progress });
    setMockRuntime({ id: createId('mock'), questions, currentIndex: 0, answers: [], progressSnapshot: learningState.progress, remainingSeconds: MOCK_TIME_LIMIT_SECONDS });
    setSelectedChoiceIndex(null); setLastMockResult(null); setScreen('mock-session');
  };

  const handleTrainingChoice = (index: number): void => {
    if (!currentTrainingQuestion || showTrainingFeedback) return;
    setSelectedChoiceIndex(index); setShowTrainingFeedback(true);
  };

  const advanceTraining = (): void => {
    if (!trainingRuntime || !currentTrainingQuestion || selectedChoiceIndex === null) return;
    const isCorrect = selectedChoiceIndex === currentTrainingQuestion.answerIndex;
    const nextProgress = updateQuestionProgress(trainingRuntime.progressSnapshot, currentTrainingQuestion, isCorrect);
    const nextAnswers = [...trainingRuntime.answers, { questionId: currentTrainingQuestion.id, selectedIndex: selectedChoiceIndex, isCorrect }];
    const isLastPracticeQuestion = trainingRuntime.phase === 'practice' && trainingRuntime.currentIndex >= trainingRuntime.practiceQuestions.length - 1;
    const isLastMiniTestQuestion = trainingRuntime.phase === 'mini-test' && trainingRuntime.currentIndex >= trainingRuntime.miniTestQuestions.length - 1;
    if (isLastMiniTestQuestion) { const completedRuntime = { ...trainingRuntime, answers: nextAnswers, progressSnapshot: nextProgress }; setTrainingRuntime(completedRuntime); setSelectedChoiceIndex(null); setShowTrainingFeedback(false); finalizeTrainingSession('completed', completedRuntime); return; }
    if (isLastPracticeQuestion) setTrainingRuntime({ ...trainingRuntime, phase: 'mini-test', currentIndex: 0, answers: nextAnswers, progressSnapshot: nextProgress });
    else setTrainingRuntime({ ...trainingRuntime, currentIndex: trainingRuntime.currentIndex + 1, answers: nextAnswers, progressSnapshot: nextProgress });
    setSelectedChoiceIndex(null); setShowTrainingFeedback(false);
  };

  const handleMockChoice = (index: number): void => { if (currentMockQuestion) setSelectedChoiceIndex(index); };
  const advanceMock = (): void => {
    if (!mockRuntime || !currentMockQuestion || selectedChoiceIndex === null) return;
    const isCorrect = selectedChoiceIndex === currentMockQuestion.answerIndex;
    const nextProgress = updateQuestionProgress(mockRuntime.progressSnapshot, currentMockQuestion, isCorrect);
    const nextAnswers = [...mockRuntime.answers, { questionId: currentMockQuestion.id, selectedIndex: selectedChoiceIndex, isCorrect }];
    const isLastQuestion = mockRuntime.currentIndex >= mockRuntime.questions.length - 1;
    if (isLastQuestion) { const completedRuntime = { ...mockRuntime, answers: nextAnswers, progressSnapshot: nextProgress }; setMockRuntime(completedRuntime); setSelectedChoiceIndex(null); finalizeMockTest('completed', completedRuntime); return; }
    setMockRuntime({ ...mockRuntime, currentIndex: mockRuntime.currentIndex + 1, answers: nextAnswers, progressSnapshot: nextProgress }); setSelectedChoiceIndex(null);
  };

  const resetAllLearningData = (): void => {
    if (!window.confirm('学習履歴、トレーニング結果、疑似テスト結果をすべてリセットします。よろしいですか？')) return;
    speechService.stop(); learningStorage.clear(); setLearningState(emptyLearningState); setTrainingRuntime(null); setMockRuntime(null); setSelectedChoiceIndex(null); setShowTrainingFeedback(false); setLastTrainingResult(null); setLastMockResult(null); setResetStatusMessage('学習データをリセットしました。'); setScreen('home'); syncSpeechUi();
  };

  return (
    <main className="app-shell">
      {resetStatusMessage && <p className="note note-success">{resetStatusMessage}</p>}

      {screen === 'home' && (
        <>
          <header className="hero card">
            <p className="eyebrow">英検準一級 合格育成アプリ</p>
            <h1>準一 JUNICHI v1.1</h1>
            <p className="subtitle">5分トレーニングで語彙を積み上げ、疑似テストで現在地を測る。日々の習慣化を司令塔のように案内する版です。</p>
            <div className="hero-meta"><span>総合ランク {rankInfo.current}</span><span>{rankInfo.streak.current}日連続</span><span>{dueCount}問が復習対象</span></div>
            <p className="environment-note">推奨ブラウザ: Google Chrome（Android / Desktop）</p>
          </header>
          <section className="card feature-card">
            <div className="card-header"><div><p className="section-label">今日の司令</p><h2>次のおすすめ5分</h2></div><span className="pill pill-primary">{difficultyLabel(recommendedDifficulty)}</span></div>
            <p className="lead-text">{nextActionLabel}</p>
            <p className="note note-info">{weaknessHint}</p>
            <div className="action-row"><button type="button" className="primary-button" onClick={() => startTraining(recommendedDifficulty)}>おすすめ5分を開始</button><button type="button" className="ghost-button" onClick={() => setScreen('training-select')}>難易度を選んで始める</button></div>
          </section>
          <section className="card status-grid-card">
            <div className="card-header"><div><p className="section-label">ステータス</p><h2>現在の到達度</h2></div><button type="button" className="ghost-button" onClick={() => setScreen('status')}>詳細を見る</button></div>
            <div className="stats-grid stats-grid-wide">
              <article className="stat-card"><p className="stat-label">トレーニング正答率</p><p className="stat-value">{formatPercent(rankInfo.trainingAccuracy)}</p></article>
              <article className="stat-card"><p className="stat-label">ミニテスト平均</p><p className="stat-value">{formatPercent(rankInfo.miniTestAccuracy)}</p></article>
              <article className="stat-card"><p className="stat-label">疑似テスト平均</p><p className="stat-value">{formatPercent(rankInfo.mockTestAccuracy)}</p></article>
              <article className="stat-card"><p className="stat-label">次の昇格条件</p><p className="stat-value stat-text">{rankInfo.nextRequirement}</p></article>
            </div>
          </section>
          <section className="card">
            <div className="card-header"><div><p className="section-label">モード</p><h2>学習導線</h2></div></div>
            <div className="mode-grid"><button type="button" className="mode-card" onClick={() => setScreen('training-select')}><strong>トレーニング</strong><span>基礎 / 標準 / 実戦の5分反復</span></button><button type="button" className={`mode-card${mockUnlocked ? '' : ' is-locked'}`} onClick={() => setScreen('mock-intro')}><strong>疑似テスト</strong><span>{mockUnlocked ? '語彙18問・時間制限あり' : `解放まであと${Math.max(0, 3 - learningState.sessions.filter((s) => s.mode === 'training').length)}回のトレーニング`}</span></button></div>
            <div className="coming-soon-list"><span>長文語句補充（準備中）</span><span>長文読解（準備中）</span><span>要約（準備中）</span><span>英作文（準備中）</span><span>リスニング（準備中）</span></div>
          </section>
        </>
      )}

      {screen === 'training-select' && (
        <>
          <section className="card feature-card"><div className="card-header"><div><p className="section-label">トレーニング選択</p><h2>語彙補充トレーニング</h2></div><button type="button" className="ghost-button" onClick={() => setScreen('home')}>ホームへ戻る</button></div><p className="subtitle compact">v1.1 では語彙補充を主実装対象とし、5分反復 + 3問ミニテストで地力を育てます。</p></section>
          <section className="card difficulty-card">
            <p className="section-label">難易度レーン</p>
            <div className="difficulty-grid">
              {(['basic','standard','practical'] as Difficulty[]).map((difficulty) => (
                <button key={difficulty} type="button" className={`difficulty-option${selectedDifficulty === difficulty ? ' is-selected' : ''}`} onClick={() => setSelectedDifficulty(difficulty)}><strong>{difficultyLabel(difficulty)}</strong><span>{difficulty === 'basic' && '頻出語と素直な誤答で土台を固める'}{difficulty === 'standard' && '準一級らしい文脈判断を安定させる'}{difficulty === 'practical' && '紛らわしい選択肢まで含めて鍛える'}</span></button>
              ))}
            </div>
            <div className="action-row"><button type="button" className="primary-button" onClick={() => startTraining(selectedDifficulty)}>5分セッション開始</button></div>
          </section>
        </>
      )}

      {screen === 'training-session' && trainingRuntime && currentTrainingQuestion && (
        <section className="card quiz-card wide-card">
          <div className="card-header"><div><p className="section-label">{trainingRuntime.phase === 'practice' ? '反復トレーニング' : 'ミニテスト'}</p><h2>{sectionLabel(currentTrainingQuestion.section)}</h2></div><div className="session-header-meta"><span className="pill">{difficultyLabel(trainingRuntime.difficulty)}</span><span className="pill">残り {formatCountdown(trainingRuntime.remainingSeconds)}</span></div></div>
          <div className="session-progress-row"><span>進捗 {(trainingRuntime.phase === 'practice' ? trainingRuntime.currentIndex + 1 : trainingRuntime.practiceQuestions.length + trainingRuntime.currentIndex + 1)} / {trainingRuntime.practiceQuestions.length + trainingRuntime.miniTestQuestions.length}</span><span>学習履歴 {buildProgressSummary(currentTrainingQuestion, trainingRuntime.progressSnapshot).attempts}回</span><span>{buildProgressSummary(currentTrainingQuestion, trainingRuntime.progressSnapshot).isDue ? '復習対象' : '新規 / 先取り'}</span></div>
          <div className="question-panel"><p className="question-prompt">{currentTrainingQuestion.prompt}</p><button className={`speak-button${!speechService.isAvailable() ? ' is-unavailable' : ''}${speechPlaying ? ' is-playing' : ''}`} type="button" onClick={() => onSpeak(currentTrainingQuestion)}>{speechPlaying ? '🔊 再生中…' : speechReady ? '🔁 もう一度読み上げ' : '🔊 英文を読み上げ'}</button>{speechStatusMessage && <p className="note note-error">{speechStatusMessage}</p>}{voiceDebugLabel && <p className="note note-debug">DEV voice: {voiceDebugLabel}</p>}</div>
          <div className="choices">{currentTrainingQuestion.choices.map((choice, index) => { const isSelected = selectedChoiceIndex === index; const showCorrect = showTrainingFeedback && index === currentTrainingQuestion.answerIndex; const showWrong = showTrainingFeedback && isSelected && index !== currentTrainingQuestion.answerIndex; return <button key={`${currentTrainingQuestion.id}-${choice}`} type="button" className={`choice${showCorrect ? ' correct' : ''}${showWrong ? ' wrong' : ''}${isSelected ? ' is-selected' : ''}`} disabled={showTrainingFeedback} onClick={() => handleTrainingChoice(index)}>{choice}</button>; })}</div>
          {showTrainingFeedback && <div className="answer-panel" data-status={selectedChoiceIndex === currentTrainingQuestion.answerIndex ? 'correct' : 'wrong'}><p className="answer-heading">{selectedChoiceIndex === currentTrainingQuestion.answerIndex ? '正解です' : 'ここは要復習です'}</p><p className="answer-detail">正解: <strong>{currentTrainingQuestion.choices[currentTrainingQuestion.answerIndex]}</strong></p>{currentTrainingQuestion.translation && <p className="answer-subdetail">訳: {currentTrainingQuestion.translation}</p>}<p className="answer-subdetail">解説: {currentTrainingQuestion.explanation}</p></div>}
          <div className="action-row"><button type="button" className="ghost-button" onClick={() => setScreen('home')}>中断してホームへ</button><button type="button" className="primary-button" disabled={!showTrainingFeedback} onClick={advanceTraining}>{trainingRuntime.phase === 'mini-test' && trainingRuntime.currentIndex === trainingRuntime.miniTestQuestions.length - 1 ? '結果を見る' : trainingRuntime.phase === 'practice' && trainingRuntime.currentIndex === trainingRuntime.practiceQuestions.length - 1 ? 'ミニテストへ' : '次へ'}</button></div>
        </section>
      )}

      {screen === 'training-result' && lastTrainingResult && (
        <>
          <section className="card feature-card"><div className="card-header"><div><p className="section-label">トレーニング結果</p><h2>{difficultyLabel(lastTrainingResult.summary.difficulty)} 5分セッション完了</h2></div><span className="pill pill-primary">総合 {lastTrainingResult.summary.overallAccuracy}%</span></div><div className="stats-grid stats-grid-wide"><article className="stat-card"><p className="stat-label">反復トレ</p><p className="stat-value">{lastTrainingResult.summary.practiceCorrect} / {lastTrainingResult.summary.practiceTotal}</p></article><article className="stat-card"><p className="stat-label">ミニテスト</p><p className="stat-value">{lastTrainingResult.summary.miniCorrect} / {lastTrainingResult.summary.miniTotal}</p></article><article className="stat-card"><p className="stat-label">現在ランク</p><p className="stat-value">{lastTrainingResult.rankInfo.current}</p></article><article className="stat-card"><p className="stat-label">次の条件</p><p className="stat-value stat-text">{lastTrainingResult.rankInfo.nextRequirement}</p></article></div><p className="note note-success">直近ミニテスト平均: {formatPercent(lastTrainingResult.rankInfo.miniTestAccuracy)}</p></section>
          <section className="card"><div className="action-row"><button type="button" className="primary-button" onClick={() => startTraining(getRecommendedDifficulty(learningState))}>次の5分へ進む</button><button type="button" className="ghost-button" onClick={() => setScreen('home')}>ホームへ戻る</button></div></section>
        </>
      )}

      {screen === 'mock-intro' && (
        <section className="card feature-card"><div className="card-header"><div><p className="section-label">疑似テスト</p><h2>語彙18問モード</h2></div><button type="button" className="ghost-button" onClick={() => setScreen('home')}>ホームへ戻る</button></div><p className="subtitle compact">本番さながらに、途中解説なし・18問・時間制限ありで現在地を測ります。v1.1 では語彙セクションのみを先行実装しています。</p><div className="stats-grid stats-grid-wide"><article className="stat-card"><p className="stat-label">問題数</p><p className="stat-value">18問</p></article><article className="stat-card"><p className="stat-label">制限時間</p><p className="stat-value">18分</p></article><article className="stat-card"><p className="stat-label">解放条件</p><p className="stat-value">5分トレーニング3回</p></article><article className="stat-card"><p className="stat-label">達成度</p><p className="stat-value">{learningState.sessions.filter((s) => s.mode === 'training').length} / 3</p></article></div>{!mockUnlocked && <p className="note note-warning">あと {Math.max(0, 3 - learningState.sessions.filter((s) => s.mode === 'training').length)} 回のトレーニングで解放されます。</p>}<div className="action-row"><button type="button" className="primary-button" disabled={!mockUnlocked} onClick={startMockTest}>疑似テスト開始</button>{!mockUnlocked && <button type="button" className="ghost-button" onClick={() => startTraining(recommendedDifficulty)}>先に5分トレーニングへ</button>}</div></section>
      )}

      {screen === 'mock-session' && mockRuntime && currentMockQuestion && (
        <section className="card quiz-card wide-card"><div className="card-header"><div><p className="section-label">疑似テスト</p><h2>語彙18問モード</h2></div><div className="session-header-meta"><span className="pill">問題 {mockRuntime.currentIndex + 1} / {mockRuntime.questions.length}</span><span className="pill">残り {formatCountdown(mockRuntime.remainingSeconds)}</span></div></div><p className="question-prompt">{currentMockQuestion.prompt}</p><div className="choices">{currentMockQuestion.choices.map((choice, index) => <button key={`${currentMockQuestion.id}-${choice}`} type="button" className={`choice${selectedChoiceIndex === index ? ' is-selected' : ''}`} onClick={() => handleMockChoice(index)}>{choice}</button>)}</div><div className="action-row"><button type="button" className="ghost-button" onClick={() => finalizeMockTest('completed')}>ここまでで採点</button><button type="button" className="primary-button" disabled={selectedChoiceIndex === null} onClick={advanceMock}>{mockRuntime.currentIndex === mockRuntime.questions.length - 1 ? '提出して結果を見る' : '次へ'}</button></div></section>
      )}

      {screen === 'mock-result' && lastMockResult && (
        <>
          <section className="card feature-card"><div className="card-header"><div><p className="section-label">疑似テスト結果</p><h2>語彙18問モード採点完了</h2></div><span className="pill pill-primary">正答率 {lastMockResult.mockRecord.accuracy}%</span></div><div className="stats-grid stats-grid-wide"><article className="stat-card"><p className="stat-label">得点</p><p className="stat-value">{lastMockResult.mockRecord.correctAnswers} / {lastMockResult.mockRecord.totalQuestions}</p></article><article className="stat-card"><p className="stat-label">現在ランク</p><p className="stat-value">{lastMockResult.rankInfo.current}</p></article><article className="stat-card"><p className="stat-label">疑似テスト平均</p><p className="stat-value">{formatPercent(lastMockResult.rankInfo.mockTestAccuracy)}</p></article><article className="stat-card"><p className="stat-label">次の条件</p><p className="stat-value stat-text">{lastMockResult.rankInfo.nextRequirement}</p></article></div></section>
          <section className="card"><div className="card-header"><div><p className="section-label">復習候補</p><h2>今回の取りこぼし</h2></div></div>{lastMockResult.wrongQuestions.length === 0 ? <p className="note note-success">取りこぼしなし。かなり良い状態です。</p> : <div className="review-list">{lastMockResult.wrongQuestions.slice(0, 5).map((question) => <article key={question.id} className="review-item"><p className="review-title">{question.prompt}</p><p className="review-answer">正解: {question.choices[question.answerIndex]}</p><p className="review-detail">{question.explanation}</p></article>)}</div>}<div className="action-row"><button type="button" className="primary-button" onClick={() => startTraining(recommendedDifficulty)}>弱点補強の5分へ</button><button type="button" className="ghost-button" onClick={() => setScreen('home')}>ホームへ戻る</button></div></section>
        </>
      )}

      {screen === 'status' && (
        <>
          <section className="card feature-card"><div className="card-header"><div><p className="section-label">ステータス画面</p><h2>JUNICHI 独自ランク</h2></div><button type="button" className="ghost-button" onClick={() => setScreen('home')}>ホームへ戻る</button></div><p className="lead-text">{rankInfo.current} — {rankInfo.label}</p><p className="note note-info">次の昇格条件: {rankInfo.nextRequirement}</p></section>
          <section className="card status-grid-card"><div className="stats-grid stats-grid-wide"><article className="stat-card"><p className="stat-label">連続学習日数</p><p className="stat-value">{rankInfo.streak.current}日</p></article><article className="stat-card"><p className="stat-label">最長連続</p><p className="stat-value">{rankInfo.streak.longest}日</p></article><article className="stat-card"><p className="stat-label">トレーニング回数</p><p className="stat-value">{learningState.sessions.filter((s) => s.mode === 'training').length}</p></article><article className="stat-card"><p className="stat-label">復習対象</p><p className="stat-value">{dueCount}問</p></article><article className="stat-card"><p className="stat-label">語彙トレ正答率</p><p className="stat-value">{formatPercent(rankInfo.trainingAccuracy)}</p></article><article className="stat-card"><p className="stat-label">ミニテスト平均</p><p className="stat-value">{formatPercent(rankInfo.miniTestAccuracy)}</p></article><article className="stat-card"><p className="stat-label">疑似テスト平均</p><p className="stat-value">{formatPercent(rankInfo.mockTestAccuracy)}</p></article><article className="stat-card"><p className="stat-label">最新ミニテスト</p><p className="stat-value">{latestMiniTest ? `${latestMiniTest.correctAnswers}/${latestMiniTest.totalQuestions}` : '未実施'}</p></article></div></section>
          <section className="card"><div className="card-header"><div><p className="section-label">セクション状況</p><h2>語彙補充</h2></div></div><p className="note">主実装対象: 語彙補充。長文・要約・英作文・リスニングは UI スロットのみ確保済みです。</p><p className="note note-info">最新疑似テスト: {latestMockTest ? `${latestMockTest.correctAnswers}/${latestMockTest.totalQuestions} (${latestMockTest.accuracy}%)` : '未実施'}</p><div className="action-row"><button type="button" className="primary-button" onClick={() => startTraining(recommendedDifficulty)}>おすすめ5分へ</button><button type="button" className="ghost-button" onClick={resetAllLearningData}>学習データをリセット</button></div></section>
        </>
      )}

      <p className="build-version">build {appBuildVersion}</p>
    </main>
  );
}

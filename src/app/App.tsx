import { useCallback, useEffect, useMemo, useState } from 'react';
import questionsJson from '../data/questions.json';
import {
  buildNextActionLabel,
  buildProgressSummary,
  buildWeaknessHint,
  computeRankInfo,
  finalizeLearningState,
  getRecommendedDifficulty,
  getWeakRecommendations,
  isMockTestUnlocked,
  updateQuestionProgress
} from '../domain/learning';
import {
  formatCountdown,
  getQuestionsBySection,
  selectMockTestQuestions,
  selectPracticeRoundQuestions,
  selectTrainingQuestions
} from '../domain/questionBank';
import type {
  AppProgress,
  Difficulty,
  LearningState,
  Question,
  QuestionProgressSummary,
  RankInfo,
  SessionRecord,
  SessionSummary,
  TestRecord,
  WeakRecommendation
} from '../domain/types';
import { createBrowserSpeechService } from '../services/speechService';
import { createBrowserLearningStorage, emptyLearningState } from '../storage/learningStorage';

const questionBank = questionsJson as Question[];
const speechService = createBrowserSpeechService();
const learningStorage = createBrowserLearningStorage();
const appBuildVersion = __APP_VERSION__;

const TRAINING_TIME_LIMIT_SECONDS = 5 * 60;
const TRAINING_PRACTICE_COUNT = 6;
const TRAINING_MINI_TEST_COUNT = 3;
const TRAINING_MINI_TEST_TRIGGER_SECONDS = 80;
const AUTO_SPEAK_DELAY_MS = 160;
const TRAINING_SECTIONS = ['vocab-gap', 'long-gap'] as const;

const MOCK_TEST_CONFIG = {
  'vocab-gap': {
    questionCount: 18,
    timeLimitSeconds: 18 * 60,
    title: '語彙18問モード',
    shortLabel: '語彙18問',
    introDescription: '本番さながらに、途中解説なし・18問・時間制限ありで現在地を測ります。語感と意味の芯をどこまで維持できるかを見るレーンです。',
    sessionWarning: '疑似テスト中は途中解説なしです。テンポを崩さず、本番のように前へ進みます。',
    resultHeading: '語彙18問モード採点完了',
    weaknessModeLabel: '疑似テストの取りこぼし優先モード'
  },
  'long-gap': {
    questionCount: 8,
    timeLimitSeconds: 10 * 60,
    title: '長文語句補充β 8問モード',
    shortLabel: '長文β 8問',
    introDescription: '段落の流れ・逆接・因果・結論の向きを見ながら、8問をまとめて解く長文語句補充β専用レーンです。途中採点なしで文脈判断の安定度を測ります。',
    sessionWarning: '長文語句補充βの疑似テストです。段落の流れを切らさず、迷っても前へ進みます。',
    resultHeading: '長文語句補充β 8問モード採点完了',
    weaknessModeLabel: '長文β疑似テストの取りこぼし優先モード'
  }
} as const;

type Screen =
  | 'home'
  | 'training-select'
  | 'training-session'
  | 'training-result'
  | 'mock-intro'
  | 'mock-session'
  | 'mock-result'
  | 'status';
type TrainingPhase = 'practice' | 'mini-test';


type SessionEndReason = 'completed' | 'time-up';


type SupportedTrainingSection = (typeof TRAINING_SECTIONS)[number];
type MockSectionConfig = (typeof MOCK_TEST_CONFIG)[SupportedTrainingSection];

function isSupportedTrainingSection(section: Question['section']): section is SupportedTrainingSection {
  return (TRAINING_SECTIONS as readonly string[]).includes(section);
}

function buildSectionDescription(section: SupportedTrainingSection): string {
  return section === 'vocab-gap'
    ? '単語の芯と似た誤答の差を5分で固める。'
    : '短めの段落を読み、接続・因果・対比を拾う5分レーン。';
}

function buildSectionLead(section: SupportedTrainingSection): string {
  return section === 'vocab-gap'
    ? 'v1.1 の主実装対象。語感と基本義を反復で固めます。'
    : 'v1.2 β の先行実装。段落の流れから最も自然な選択肢を拾います。';
}

function getMockSectionConfig(section: SupportedTrainingSection): MockSectionConfig {
  return MOCK_TEST_CONFIG[section];
}

function buildMockSectionDescription(section: SupportedTrainingSection): string {
  return section === 'vocab-gap'
    ? '語感・意味・誤答耐性を18問で測る本番寄りレーン。'
    : '段落の流れ・逆接・因果を8問で測る長文β専用レーン。';
}

interface AnswerRecord {
  questionId: string;
  selectedIndex: number;
  isCorrect: boolean;
  phase: TrainingPhase | 'mock-test';
}

interface TrainingRuntime {
  id: string;
  section: Question['section'];
  difficulty: Difficulty;
  practiceQuestions: Question[];
  miniTestQuestions: Question[];
  phase: TrainingPhase;
  currentIndex: number;
  answers: AnswerRecord[];
  progressSnapshot: AppProgress;
  remainingSeconds: number;
  completedPracticeRounds: number;
  miniTestPending: boolean;
  prioritizedQuestionIds: string[];
  sourceLabel: string | null;
}

interface TrainingStartOptions {
  section?: SupportedTrainingSection;
  prioritizedQuestionIds?: string[];
  sourceLabel?: string;
}

interface MockRuntime {
  id: string;
  section: SupportedTrainingSection;
  questions: Question[];
  currentIndex: number;
  answers: AnswerRecord[];
  progressSnapshot: AppProgress;
  remainingSeconds: number;
  timeLimitSeconds: number;
}

interface TrainingResultPayload {
  summary: SessionSummary;
  sessionRecord: SessionRecord;
  miniTestRecord: TestRecord;
  rankInfo: RankInfo;
  wrongQuestions: Question[];
  endedReason: SessionEndReason;
  completedPracticeRounds: number;
  miniTestPending: boolean;
  promotionMessage: string | null;
}

interface MockResultPayload {
  section: SupportedTrainingSection;
  sessionRecord: SessionRecord;
  mockRecord: TestRecord;
  rankInfo: RankInfo;
  wrongQuestions: Question[];
  promotionMessage: string | null;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function difficultyLabel(value: Difficulty): string {
  return value === 'basic' ? '基礎' : value === 'standard' ? '標準' : '実戦';
}

function sectionLabel(section: Question['section']): string {
  switch (section) {
    case 'vocab-gap':
      return '語彙補充';
    case 'long-gap':
      return '長文語句補充';
    case 'reading':
      return '長文読解';
    case 'summary':
      return '要約';
    case 'writing':
      return '英作文';
    case 'listening':
      return 'リスニング';
  }
}

function buildSpeechText(question: Question): string {
  return question.audioText ?? question.prompt.replace('____', question.choices[question.answerIndex]);
}

function countCorrectAnswers(answers: AnswerRecord[]): number {
  return answers.filter((answer) => answer.isCorrect).length;
}

function escapeForRegExp(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

const PART_OF_SPEECH_MAP: Record<string, string> = {
  abandon: '動',
  compile: '動',
  reluctant: '形',
  convey: '動',
  substantial: '形',
  scarce: '形',
  prompt: '形',
  obscure: '形',
  allocate: '動',
  endure: '動',
  fragile: '形',
  attain: '動',
  deliberate: '動',
  ample: '形',
  dismiss: '動',
  impose: '動',
  foster: '動',
  inevitable: '形',
  overlook: '動',
  severe: '形',
  plausible: '形',
  distort: '動',
  meticulous: '形',
  verify: '動',
  deter: '動',
  nuanced: '形',
  feasible: '形',
  elicit: '動',
  resilient: '形',
  rectify: '動',
  ambiguous: '形',
  consecutive: '形',
  deteriorate: '動',
  compelling: '形',
  endorse: '動',
  alleviate: '動'
};

function buildAnswerMeaningText(question: Question): string {
  const answer = question.choices[question.answerIndex];
  let normalized = question.explanation.replace(new RegExp(`^${escapeForRegExp(answer)}\\s*は\\s*`), '').trim();
  normalized = normalized.replace(/[「」]/g, '').replace(/^[:：]/, '').trim();
  return normalized;
}

function buildAnswerWordLabel(question: Question): string {
  return question.choices[question.answerIndex];
}

function buildAnswerPartOfSpeechLabel(question: Question): string {
  const answer = question.choices[question.answerIndex];
  return PART_OF_SPEECH_MAP[answer] ?? '';
}

function buildPartOfSpeechClassName(label: string): string {
  switch (label) {
    case '動':
      return 'is-verb';
    case '形':
      return 'is-adjective';
    case '名':
      return 'is-noun';
    case '副':
      return 'is-adverb';
    default:
      return 'is-generic';
  }
}
function formatPercent(value: number): string {
  return `${value}%`;
}

const rankSequence = ['J5', 'J4', 'J3', 'J2', 'J1', 'S'] as const;

function buildPromotionMessage(previousRank: RankInfo, nextRank: RankInfo): string | null {
  const previousIndex = rankSequence.indexOf(previousRank.current);
  const nextIndex = rankSequence.indexOf(nextRank.current);
  if (nextIndex > previousIndex) {
    return `総合ランクが ${previousRank.current} → ${nextRank.current} に上がりました。次の5分で勢いを固めましょう。`;
  }

  for (const nextSectionRank of nextRank.sectionRanks) {
    const previousSectionRank = previousRank.sectionRanks.find((item) => item.section === nextSectionRank.section);
    if (!previousSectionRank) continue;
    const previousSectionIndex = rankSequence.indexOf(previousSectionRank.current);
    const nextSectionIndex = rankSequence.indexOf(nextSectionRank.current);
    if (nextSectionIndex > previousSectionIndex) {
      return `${sectionLabel(nextSectionRank.section)}ランクが ${previousSectionRank.current} → ${nextSectionRank.current} に上がりました。弱点回収が効いています。`;
    }
  }

  return null;
}

function formatChecklistValue(current: number, target: number, unit: '%' | '回' | '日'): string {
  return `${current}${unit} / ${target}${unit}`;
}

function buildSessionLabel(session: SessionRecord): string {
  if (session.mode === 'mock-test') return '疑似テスト';
  if (session.mode === 'mini-test') return `${sectionLabel(session.section)} ミニテスト`;
  return `${sectionLabel(session.section)} ${difficultyLabel(session.difficulty ?? 'standard')}トレ`;
}

function buildTrainingCoachMessage(runtime: TrainingRuntime | null, question: Question | null, summary: QuestionProgressSummary | null): string {
  if (!runtime || !question || !summary) return '';
  if (runtime.sourceLabel && runtime.phase === 'practice') {
    return `${runtime.sourceLabel}です。まずは頻出義と文脈の芯を取りにいき、取りこぼしを優先回収します。`;
  }
  if (runtime.phase === 'mini-test' && runtime.miniTestPending) {
    return '終盤に入りました。ここから3問だけ、途中で答えを返さない判定モードへ切り替えます。';
  }
  if (runtime.phase === 'mini-test') {
    return 'ここからは判定モードです。選択肢を変えることはできますが、正誤と解説は最後にまとめて返します。';
  }
  if (summary.isDue) {
    return '復習対象です。音を聞いたら、まず意味の芯を取りにいきましょう。迷ったら似た選択肢の差を見ます。';
  }
  if ((summary.accuracy ?? 100) <= 50 && summary.attempts >= 2) {
    return 'この語は取りこぼし気味です。文脈の流れより先に、語感と基本義を固める意識でいきます。';
  }
  if (runtime.remainingSeconds <= TRAINING_MINI_TEST_TRIGGER_SECONDS + 25) {
    return '終盤ラップです。ここからは量より精度を優先し、判定テストへ入る準備を整えます。';
  }
  if (runtime.difficulty === 'basic') {
    return '基礎レーンです。頻出語を素直に拾い、迷う前に意味を確定させるラップです。';
  }
  if (runtime.difficulty === 'standard') {
    return '標準レーンです。準一級らしい文脈判断を一段深く取りにいくラップです。';
  }
  return '実戦レーンです。紛らわしい選択肢の差まで見切る意識で、語感の精度を上げます。';
}

function buildTrainingResultMessage(payload: TrainingResultPayload): string {
  if (payload.summary.miniTotal > 0 && payload.summary.miniCorrect === payload.summary.miniTotal) {
    return '判定テストは満点です。このまま次の5分へ入ると、定着が一段進みます。';
  }
  if (payload.summary.overallAccuracy >= 80) {
    return 'かなり安定しています。次は同レーン継続か、一段上のレーン挑戦が視野です。';
  }
  if (payload.endedReason === 'time-up') {
    return '時間切れでも問題ありません。5分を積んだこと自体が、JUNICHIでは前進です。';
  }
  return '今回の取りこぼしは次の5分で回収できます。弱点候補をそのまま次の反復へ接続しましょう。';
}

export function App(): JSX.Element {
  const [learningState, setLearningState] = useState<LearningState>(() => learningStorage.load());
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(() => getRecommendedDifficulty(learningStorage.load()));
  const [selectedTrainingSection, setSelectedTrainingSection] = useState<SupportedTrainingSection>('vocab-gap');
  const [selectedMockSection, setSelectedMockSection] = useState<SupportedTrainingSection>('vocab-gap');
  const [trainingRuntime, setTrainingRuntime] = useState<TrainingRuntime | null>(null);
  const [mockRuntime, setMockRuntime] = useState<MockRuntime | null>(null);
  const [selectedChoiceIndex, setSelectedChoiceIndex] = useState<number | null>(null);
  const [showTrainingFeedback, setShowTrainingFeedback] = useState(false);
  const [speechStatusMessage, setSpeechStatusMessage] = useState<string | null>(null);
  const [speechReady, setSpeechReady] = useState<boolean>(speechService.isReady());
  const [speechPlaying, setSpeechPlaying] = useState<boolean>(speechService.isSpeaking());
  const [voiceDebugLabel, setVoiceDebugLabel] = useState<string | null>(null);
  const [resetStatusMessage, setResetStatusMessage] = useState<string | null>(null);
  const [sessionStatusMessage, setSessionStatusMessage] = useState<string | null>(null);
  const [lastTrainingResult, setLastTrainingResult] = useState<TrainingResultPayload | null>(null);
  const [lastMockResult, setLastMockResult] = useState<MockResultPayload | null>(null);

  const vocabQuestions = useMemo(() => getQuestionsBySection(questionBank, 'vocab-gap'), []);
  const longGapQuestions = useMemo(() => getQuestionsBySection(questionBank, 'long-gap'), []);
  const questionIndex = useMemo(
    () => Object.fromEntries(questionBank.map((question) => [question.id, question] as const)),
    []
  );
  const rankInfo = useMemo(() => computeRankInfo(learningState, questionBank), [learningState]);
  const dueCount = useMemo(
    () => Object.values(learningState.progress.entries).filter((entry) => new Date(entry.dueAt).getTime() <= Date.now()).length,
    [learningState.progress.entries]
  );
  const recommendedDifficulty = useMemo(() => getRecommendedDifficulty(learningState), [learningState]);
  const nextActionLabel = useMemo(() => buildNextActionLabel(questionBank, learningState), [learningState]);
  const weaknessHint = useMemo(() => buildWeaknessHint(questionBank.filter((question) => isSupportedTrainingSection(question.section)), learningState), [learningState]);
  const weakRecommendations = useMemo<WeakRecommendation[]>(() => getWeakRecommendations(questionBank.filter((question) => isSupportedTrainingSection(question.section)), learningState, 3), [learningState]);
  const weakRecommendationsBySection = useMemo(() => weakRecommendations.reduce((acc, item) => {
    if (isSupportedTrainingSection(item.section)) {
      (acc[item.section] ??= []).push(item);
    }
    return acc;
  }, {} as Partial<Record<SupportedTrainingSection, WeakRecommendation[]>>), [weakRecommendations]);
  const weakestPrioritySection = useMemo<SupportedTrainingSection>(() => {
    const first = weakRecommendations[0];
    return first && isSupportedTrainingSection(first.section) ? first.section : 'vocab-gap';
  }, [weakRecommendations]);
  const weakRecommendationIds = useMemo(() => (weakRecommendationsBySection[weakestPrioritySection] ?? []).map((item) => item.questionId), [weakRecommendationsBySection, weakestPrioritySection]);
  const mockUnlocked = useMemo(() => isMockTestUnlocked(learningState), [learningState]);
  const latestMiniTest = learningState.miniTests[learningState.miniTests.length - 1] ?? null;
  const latestMockTest = learningState.mockTests[learningState.mockTests.length - 1] ?? null;
  const selectedMockConfig = useMemo(() => getMockSectionConfig(selectedMockSection), [selectedMockSection]);
  const recentSessions = useMemo(() => [...learningState.sessions].slice(-6).reverse(), [learningState.sessions]);

  const currentTrainingQuestion = useMemo(() => {
    if (!trainingRuntime) return null;
    return trainingRuntime.phase === 'practice'
      ? trainingRuntime.practiceQuestions[trainingRuntime.currentIndex] ?? null
      : trainingRuntime.miniTestQuestions[trainingRuntime.currentIndex] ?? null;
  }, [trainingRuntime]);
  const currentMockQuestion = useMemo(
    () => (mockRuntime ? mockRuntime.questions[mockRuntime.currentIndex] ?? null : null),
    [mockRuntime]
  );

  const currentTrainingSummary = useMemo<QuestionProgressSummary | null>(() => {
    if (!trainingRuntime || !currentTrainingQuestion) return null;
    return buildProgressSummary(currentTrainingQuestion, trainingRuntime.progressSnapshot);
  }, [trainingRuntime, currentTrainingQuestion]);

  const selectedTrainingChoice = useMemo(() => {
    if (!currentTrainingQuestion || selectedChoiceIndex === null) return null;
    return currentTrainingQuestion.choices[selectedChoiceIndex] ?? null;
  }, [currentTrainingQuestion, selectedChoiceIndex]);

  const selectedMockChoice = useMemo(() => {
    if (!currentMockQuestion || selectedChoiceIndex === null) return null;
    return currentMockQuestion.choices[selectedChoiceIndex] ?? null;
  }, [currentMockQuestion, selectedChoiceIndex]);

  const trainingLiveStats = useMemo(() => {
    if (!trainingRuntime) {
      return {
        practiceAnswered: 0,
        practiceCorrect: 0,
        miniAnswered: 0,
        miniCorrect: 0,
        totalAnswered: 0,
        totalCorrect: 0,
        progressPercent: 0,
        roundDisplay: 1
      };
    }
    const practiceAnswers = trainingRuntime.answers.filter((answer) => answer.phase === 'practice');
    const miniAnswers = trainingRuntime.answers.filter((answer) => answer.phase === 'mini-test');
    const totalAnswered = trainingRuntime.answers.length;
    return {
      practiceAnswered: practiceAnswers.length,
      practiceCorrect: countCorrectAnswers(practiceAnswers),
      miniAnswered: miniAnswers.length,
      miniCorrect: countCorrectAnswers(miniAnswers),
      totalAnswered,
      totalCorrect: countCorrectAnswers(trainingRuntime.answers),
      progressPercent: Math.min(
        100,
        Math.round(((TRAINING_TIME_LIMIT_SECONDS - trainingRuntime.remainingSeconds) / TRAINING_TIME_LIMIT_SECONDS) * 100)
      ),
      roundDisplay:
        trainingRuntime.phase === 'practice'
          ? trainingRuntime.completedPracticeRounds + 1
          : Math.max(1, trainingRuntime.completedPracticeRounds)
    };
  }, [trainingRuntime]);

  const mockProgressPercent = useMemo(() => {
    if (!mockRuntime || mockRuntime.questions.length === 0) return 0;
    return Math.round((mockRuntime.currentIndex / mockRuntime.questions.length) * 100);
  }, [mockRuntime]);

  const trainingCoachMessage = useMemo(
    () => buildTrainingCoachMessage(trainingRuntime, currentTrainingQuestion, currentTrainingSummary),
    [trainingRuntime, currentTrainingQuestion, currentTrainingSummary]
  );

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

  const onSpeak = useCallback(
    (question: Question | null): void => {
      if (!question) return;
      if (!speechService.isAvailable()) {
        setSpeechStatusMessage('このブラウザでは音声再生が利用できない可能性があります。Chrome の利用を推奨します。');
        setSpeechPlaying(false);
        return;
      }
      setSpeechStatusMessage(null);
      setSpeechPlaying(false);
      speechService.stop();
      speechService.init();
      speechService.speak(buildSpeechText(question));
      syncSpeechUi();
      window.setTimeout(syncSpeechUi, 80);
      window.setTimeout(syncSpeechUi, 180);
      window.setTimeout(syncSpeechUi, 450);
      window.setTimeout(syncSpeechUi, 900);
      window.setTimeout(syncSpeechUi, 1500);
    },
    [syncSpeechUi]
  );

  const stopSpeechPlayback = useCallback((): void => {
    speechService.stop();
    syncSpeechUi();
    window.setTimeout(syncSpeechUi, 80);
    window.setTimeout(syncSpeechUi, 180);
    window.setTimeout(syncSpeechUi, 450);
  }, [syncSpeechUi]);
  const finalizeTrainingSession = useCallback(
    (reason: SessionEndReason, runtimeOverride?: TrainingRuntime): void => {
      const runtime = runtimeOverride ?? trainingRuntime;
      if (!runtime) return;
      stopSpeechPlayback();

      const practiceAnswers = runtime.answers.filter((answer) => answer.phase === 'practice');
      const miniAnswers = runtime.answers.filter((answer) => answer.phase === 'mini-test');
      const practiceCorrect = countCorrectAnswers(practiceAnswers);
      const miniCorrect = countCorrectAnswers(miniAnswers);
      const answeredCount = runtime.answers.length;
      const nowIso = new Date().toISOString();
      const durationSeconds = TRAINING_TIME_LIMIT_SECONDS - runtime.remainingSeconds;
      const wrongIds = new Set(runtime.answers.filter((answer) => !answer.isCorrect).map((answer) => answer.questionId));
      const completedPracticeRounds = runtime.completedPracticeRounds + (runtime.phase === 'practice' && practiceAnswers.length > runtime.completedPracticeRounds * TRAINING_PRACTICE_COUNT ? 1 : 0);

      const summary: SessionSummary = {
        sessionId: runtime.id,
        difficulty: runtime.difficulty,
        practiceCorrect,
        practiceTotal: practiceAnswers.length,
        miniCorrect,
        miniTotal: miniAnswers.length,
        overallAccuracy: answeredCount === 0 ? 0 : Math.round(((practiceCorrect + miniCorrect) / answeredCount) * 100),
        durationSeconds,
        completedAt: nowIso
      };

      const sessionRecord: SessionRecord = {
        id: runtime.id,
        mode: 'training',
        section: runtime.section,
        difficulty: runtime.difficulty,
        totalQuestions: answeredCount,
        correctAnswers: practiceCorrect + miniCorrect,
        accuracy: summary.overallAccuracy,
        durationSeconds,
        completedAt: nowIso
      };
      const miniTestRecord: TestRecord = {
        id: `${runtime.id}-mini`,
        type: 'mini-test',
        section: runtime.section,
        totalQuestions: miniAnswers.length,
        correctAnswers: miniCorrect,
        accuracy: miniAnswers.length === 0 ? 0 : Math.round((miniCorrect / miniAnswers.length) * 100),
        durationSeconds,
        completedAt: nowIso
      };

      const previousRankInfo = computeRankInfo(learningState, questionBank);
      const nextState = finalizeLearningState(learningState, {
        progress: runtime.progressSnapshot,
        addSession: sessionRecord,
        addMiniTest: miniTestRecord
      });
      const nextRankInfo = computeRankInfo(nextState, questionBank);
      learningStorage.save(nextState);
      setLearningState(nextState);
      setSelectedDifficulty(runtime.difficulty);
      setTrainingRuntime(null);
      setSelectedChoiceIndex(null);
      setShowTrainingFeedback(false);
      setSessionStatusMessage(null);
      setLastTrainingResult({
        summary,
        sessionRecord,
        miniTestRecord,
        rankInfo: nextRankInfo,
        wrongQuestions: [...wrongIds].map((questionId) => questionIndex[questionId]).filter(Boolean),
        endedReason: reason,
        completedPracticeRounds,
        miniTestPending: false,
        promotionMessage: buildPromotionMessage(previousRankInfo, nextRankInfo)
      });
      setScreen('training-result');
      if (reason === 'time-up') {
        setResetStatusMessage('5分経過。ここまでの結果でセッションを保存しました。');
      }
    },
    [learningState, questionIndex, stopSpeechPlayback, trainingRuntime]
  );

  const finalizeMockTest = useCallback(
    (reason: 'completed' | 'time-up', runtimeOverride?: MockRuntime): void => {
      const runtime = runtimeOverride ?? mockRuntime;
      if (!runtime) return;
      stopSpeechPlayback();
      const correctAnswers = countCorrectAnswers(runtime.answers);
      const accuracy = runtime.answers.length === 0 ? 0 : Math.round((correctAnswers / runtime.answers.length) * 100);
      const nowIso = new Date().toISOString();
      const durationSeconds = runtime.timeLimitSeconds - runtime.remainingSeconds;
      const sessionRecord: SessionRecord = {
        id: runtime.id,
        mode: 'mock-test',
        section: runtime.section,
        totalQuestions: runtime.answers.length,
        correctAnswers,
        accuracy,
        durationSeconds,
        completedAt: nowIso
      };
      const mockRecord: TestRecord = {
        id: `${runtime.id}-mock`,
        type: 'mock-test',
        section: runtime.section,
        totalQuestions: runtime.answers.length,
        correctAnswers,
        accuracy,
        durationSeconds,
        completedAt: nowIso
      };
      const wrongIds = new Set(runtime.answers.filter((answer) => !answer.isCorrect).map((answer) => answer.questionId));
      const previousRankInfo = computeRankInfo(learningState, questionBank);
      const nextState = finalizeLearningState(learningState, {
        progress: runtime.progressSnapshot,
        addSession: sessionRecord,
        addMockTest: mockRecord
      });
      const nextRankInfo = computeRankInfo(nextState, questionBank);
      learningStorage.save(nextState);
      setLearningState(nextState);
      setMockRuntime(null);
      setSelectedChoiceIndex(null);
      setSessionStatusMessage(null);
      setLastMockResult({
        section: runtime.section,
        sessionRecord,
        mockRecord,
        rankInfo: nextRankInfo,
        wrongQuestions: runtime.questions.filter((question) => wrongIds.has(question.id)),
        promotionMessage: buildPromotionMessage(previousRankInfo, nextRankInfo)
      });
      setScreen('mock-result');
      if (reason === 'time-up') {
        setResetStatusMessage('疑似テスト時間終了。ここまでの解答で採点しました。');
      }
    },
    [learningState, mockRuntime, stopSpeechPlayback]
  );

  useEffect(() => {
    syncSpeechUi();
  }, [syncSpeechUi]);

  useEffect(() => {
    if (!resetStatusMessage) return undefined;
    const timeoutId = window.setTimeout(() => setResetStatusMessage(null), 2800);
    return () => window.clearTimeout(timeoutId);
  }, [resetStatusMessage]);

  useEffect(() => {
    if (!sessionStatusMessage) return undefined;
    const timeoutId = window.setTimeout(() => setSessionStatusMessage(null), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [sessionStatusMessage]);

  useEffect(() => {
    if (screen === 'training-session' || screen === 'mock-session') return;
    stopSpeechPlayback();
  }, [screen, stopSpeechPlayback]);

  useEffect(() => {
    if (screen !== 'training-session' || !trainingRuntime || trainingRuntime.remainingSeconds <= 0) return undefined;
    const timerId = window.setTimeout(() => {
      setTrainingRuntime((current) => {
        if (!current) return current;
        const nextRemaining = current.remainingSeconds - 1;
        if (nextRemaining <= 0) {
          window.setTimeout(() => finalizeTrainingSession('time-up'), 0);
          return { ...current, remainingSeconds: 0 };
        }
        return { ...current, remainingSeconds: nextRemaining };
      });
    }, 1000);
    return () => window.clearTimeout(timerId);
  }, [screen, trainingRuntime, finalizeTrainingSession]);

  useEffect(() => {
    if (screen !== 'mock-session' || !mockRuntime || mockRuntime.remainingSeconds <= 0) return undefined;
    const timerId = window.setTimeout(() => {
      setMockRuntime((current) => {
        if (!current) return current;
        const nextRemaining = current.remainingSeconds - 1;
        if (nextRemaining <= 0) {
          window.setTimeout(() => finalizeMockTest('time-up'), 0);
          return { ...current, remainingSeconds: 0 };
        }
        return { ...current, remainingSeconds: nextRemaining };
      });
    }, 1000);
    return () => window.clearTimeout(timerId);
  }, [screen, mockRuntime, finalizeMockTest]);

  useEffect(() => {
    setSpeechStatusMessage(null);
    syncSpeechUi();
  }, [currentTrainingQuestion?.id, currentMockQuestion?.id, syncSpeechUi]);

  useEffect(() => {
    if (screen !== 'training-session' || !currentTrainingQuestion) return;
    setSelectedChoiceIndex(null);
    setShowTrainingFeedback(false);
  }, [screen, trainingRuntime?.phase, currentTrainingQuestion?.id]);

  useEffect(() => {
    if (screen !== 'mock-session' || !currentMockQuestion) return;
    setSelectedChoiceIndex(null);
  }, [screen, currentMockQuestion?.id]);

  useEffect(() => {
    if (screen !== 'training-session' || !currentTrainingQuestion || trainingRuntime?.miniTestPending) return undefined;
    const timeoutId = window.setTimeout(() => onSpeak(currentTrainingQuestion), AUTO_SPEAK_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [screen, currentTrainingQuestion?.id, trainingRuntime?.miniTestPending, onSpeak]);

  useEffect(() => {
    if (screen !== 'mock-session' || !currentMockQuestion) return undefined;
    const timeoutId = window.setTimeout(() => onSpeak(currentMockQuestion), AUTO_SPEAK_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [screen, currentMockQuestion?.id, onSpeak]);

  const startTraining = (difficulty: Difficulty, options?: TrainingStartOptions): void => {
    const section = options?.section ?? selectedTrainingSection;
    const trainingQuestions = getQuestionsBySection(questionBank, section);
    const prioritizedQuestionIds = options?.prioritizedQuestionIds ?? [];
    const prioritizedIdSet = new Set(prioritizedQuestionIds);
    const { practiceQuestions, miniTestQuestions } = selectTrainingQuestions({
      questions: trainingQuestions,
      difficulty,
      progress: learningState.progress,
      practiceCount: TRAINING_PRACTICE_COUNT,
      miniTestCount: TRAINING_MINI_TEST_COUNT,
      prioritizedIds: prioritizedIdSet
    });
    setTrainingRuntime({
      id: createId('training'),
      section,
      difficulty,
      practiceQuestions,
      miniTestQuestions,
      phase: 'practice',
      currentIndex: 0,
      answers: [],
      progressSnapshot: learningState.progress,
      remainingSeconds: TRAINING_TIME_LIMIT_SECONDS,
      completedPracticeRounds: 0,
      miniTestPending: false,
      prioritizedQuestionIds,
      sourceLabel: options?.sourceLabel ?? null
    });
    setSelectedChoiceIndex(null);
    setShowTrainingFeedback(false);
    setLastTrainingResult(null);
    setLastMockResult(null);
    setSessionStatusMessage(options?.sourceLabel ? `${options.sourceLabel}を優先した5分です。まずは反復ラップから入ります。` : `${sectionLabel(section)}の5分セッション開始。まずは反復ラップから入ります。`);
    setScreen('training-session');
  };

  const startMockTest = (): void => {
    if (!mockUnlocked) return;
    const config = getMockSectionConfig(selectedMockSection);
    const questions = selectMockTestQuestions({
      questions: questionBank,
      section: selectedMockSection,
      count: config.questionCount,
      progress: learningState.progress
    });
    setMockRuntime({
      id: createId('mock'),
      section: selectedMockSection,
      questions,
      currentIndex: 0,
      answers: [],
      progressSnapshot: learningState.progress,
      remainingSeconds: config.timeLimitSeconds,
      timeLimitSeconds: config.timeLimitSeconds
    });
    setSelectedChoiceIndex(null);
    setLastMockResult(null);
    setSessionStatusMessage(`${sectionLabel(selectedMockSection)}の疑似テスト開始。ここからは途中解説なしで現在地を測ります。`);
    setScreen('mock-session');
  };

  const handleTrainingChoice = (index: number): void => {
    if (!currentTrainingQuestion || !trainingRuntime || trainingRuntime.miniTestPending) return;
    if (trainingRuntime.phase === 'practice' && showTrainingFeedback) return;
    setSelectedChoiceIndex(index);
    if (trainingRuntime.phase === 'practice') {
      setShowTrainingFeedback(true);
    }
  };

  const advanceTraining = (): void => {
    if (!trainingRuntime || !currentTrainingQuestion || selectedChoiceIndex === null) return;
    const isCorrect = selectedChoiceIndex === currentTrainingQuestion.answerIndex;
    const nextProgress = updateQuestionProgress(trainingRuntime.progressSnapshot, currentTrainingQuestion, isCorrect);
    const nextAnswers: AnswerRecord[] = [
      ...trainingRuntime.answers,
      {
        questionId: currentTrainingQuestion.id,
        selectedIndex: selectedChoiceIndex,
        isCorrect,
        phase: trainingRuntime.phase
      }
    ];

    if (trainingRuntime.phase === 'mini-test') {
      const isLastMiniTestQuestion = trainingRuntime.currentIndex >= trainingRuntime.miniTestQuestions.length - 1;
      if (isLastMiniTestQuestion) {
        const completedRuntime: TrainingRuntime = {
          ...trainingRuntime,
          answers: nextAnswers,
          progressSnapshot: nextProgress,
          miniTestPending: false
        };
        setTrainingRuntime(completedRuntime);
        setSelectedChoiceIndex(null);
        finalizeTrainingSession('completed', completedRuntime);
        return;
      }
      setTrainingRuntime({
        ...trainingRuntime,
        currentIndex: trainingRuntime.currentIndex + 1,
        answers: nextAnswers,
        progressSnapshot: nextProgress,
        miniTestPending: false
      });
      setSelectedChoiceIndex(null);
      return;
    }

    const isLastPracticeQuestion = trainingRuntime.currentIndex >= trainingRuntime.practiceQuestions.length - 1;
    if (!isLastPracticeQuestion) {
      setTrainingRuntime({
        ...trainingRuntime,
        currentIndex: trainingRuntime.currentIndex + 1,
        answers: nextAnswers,
        progressSnapshot: nextProgress,
        miniTestPending: false
      });
      setSelectedChoiceIndex(null);
      setShowTrainingFeedback(false);
      return;
    }

    const nextCompletedRounds = trainingRuntime.completedPracticeRounds + 1;
    const practicedIds = new Set(
      nextAnswers.filter((answer) => answer.phase === 'practice').map((answer) => answer.questionId)
    );
    const shouldStartMiniTest =
      trainingRuntime.remainingSeconds <= TRAINING_MINI_TEST_TRIGGER_SECONDS ||
      practicedIds.size >= Math.max(TRAINING_PRACTICE_COUNT, getQuestionsBySection(questionBank, trainingRuntime.section).length - TRAINING_MINI_TEST_COUNT);

    if (shouldStartMiniTest) {
      setTrainingRuntime({
        ...trainingRuntime,
        phase: 'mini-test',
        currentIndex: 0,
        answers: nextAnswers,
        progressSnapshot: nextProgress,
        completedPracticeRounds: nextCompletedRounds,
        miniTestPending: true
      });
      setSessionStatusMessage('終盤に入りました。ここから3問の判定テストへ切り替わります。');
    } else {
      const nextPracticeQuestions = selectPracticeRoundQuestions({
        questions: getQuestionsBySection(questionBank, trainingRuntime.section),
        difficulty: trainingRuntime.difficulty,
        progress: nextProgress,
        count: TRAINING_PRACTICE_COUNT,
        excludeIds: practicedIds,
        seed: Date.now(),
        prioritizedIds: new Set(trainingRuntime.prioritizedQuestionIds)
      });
      setTrainingRuntime({
        ...trainingRuntime,
        practiceQuestions: nextPracticeQuestions,
        currentIndex: 0,
        answers: nextAnswers,
        progressSnapshot: nextProgress,
        completedPracticeRounds: nextCompletedRounds,
        miniTestPending: false
      });
      setSessionStatusMessage(`残り時間あり。反復ラップ ${nextCompletedRounds + 1} に入ります。`);
    }

    setSelectedChoiceIndex(null);
    setShowTrainingFeedback(false);
  };

  const handleMockChoice = (index: number): void => {
    if (currentMockQuestion) {
      setSelectedChoiceIndex(index);
    }
  };

  const advanceMock = (): void => {
    if (!mockRuntime || !currentMockQuestion || selectedChoiceIndex === null) return;
    const isCorrect = selectedChoiceIndex === currentMockQuestion.answerIndex;
    const nextProgress = updateQuestionProgress(mockRuntime.progressSnapshot, currentMockQuestion, isCorrect);
    const nextAnswers: AnswerRecord[] = [
      ...mockRuntime.answers,
      {
        questionId: currentMockQuestion.id,
        selectedIndex: selectedChoiceIndex,
        isCorrect,
        phase: 'mock-test'
      }
    ];
    const isLastQuestion = mockRuntime.currentIndex >= mockRuntime.questions.length - 1;
    if (isLastQuestion) {
      const completedRuntime: MockRuntime = {
        ...mockRuntime,
        answers: nextAnswers,
        progressSnapshot: nextProgress
      };
      setMockRuntime(completedRuntime);
      setSelectedChoiceIndex(null);
      finalizeMockTest('completed', completedRuntime);
      return;
    }
    setMockRuntime({
      ...mockRuntime,
      currentIndex: mockRuntime.currentIndex + 1,
      answers: nextAnswers,
      progressSnapshot: nextProgress
    });
    setSelectedChoiceIndex(null);
  };

  const navigateHome = useCallback((): void => {
    stopSpeechPlayback();
    setScreen('home');
  }, [stopSpeechPlayback]);

  const resetAllLearningData = (): void => {
    if (!window.confirm('学習履歴、トレーニング結果、疑似テスト結果をすべてリセットします。よろしいですか？')) return;
    stopSpeechPlayback();
    learningStorage.clear();
    setLearningState(emptyLearningState);
    setTrainingRuntime(null);
    setMockRuntime(null);
    setSelectedChoiceIndex(null);
    setShowTrainingFeedback(false);
    setLastTrainingResult(null);
    setLastMockResult(null);
    setSessionStatusMessage(null);
    setResetStatusMessage('学習データをリセットしました。');
    setScreen('home');
  };

  return (
    <main className="app-shell">
      {resetStatusMessage && <p className="note note-success">{resetStatusMessage}</p>}

      {screen === 'home' && (
        <>
          <header className="hero card">
            <p className="eyebrow">英検準一級 合格育成アプリ</p>
            <h1>準一 JUNICHI v1.2</h1>
            <p className="subtitle">
              5分トレーニングで語彙を積み上げ、疑似テストで現在地を測る。日々の習慣化を司令塔のように案内する版です。
            </p>
            <div className="hero-meta">
              <span>総合ランク {rankInfo.current}</span>
              <span>{rankInfo.streak.current}日連続</span>
              <span>{dueCount}問が復習対象</span>
            </div>
            <p className="environment-note">推奨ブラウザ: Google Chrome（Android / Desktop）</p>
          </header>
          <section className="card feature-card">
            <div className="card-header">
              <div>
                <p className="section-label">今日の司令</p>
                <h2>次のおすすめ5分</h2>
              </div>
              <span className="pill pill-primary">{difficultyLabel(recommendedDifficulty)}</span>
            </div>
            <p className="lead-text">{nextActionLabel}</p>
            <p className="note note-info">{weaknessHint}</p>
            <div className="action-row">
              <button type="button" className="primary-button" onClick={() => startTraining(recommendedDifficulty, { section: 'vocab-gap' })}>
                おすすめ5分を開始
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setSelectedTrainingSection('vocab-gap');
                  setScreen('training-select');
                }}
              >
                難易度を選んで始める
              </button>
            </div>
          </section>
          <section className="card">
            <div className="card-header">
              <div>
                <p className="section-label">自動推薦</p>
                <h2>弱点補強の優先3問</h2>
              </div>
              <span className="pill">復習最優先</span>
            </div>
            {weakRecommendations.length === 0 ? (
              <p className="note note-info">まだ弱点候補はありません。まずはおすすめ5分を1回走ると、自動推薦が育ちます。</p>
            ) : (
              <>
                <div className="recommendation-list">
                  {weakRecommendations.map((item) => (
                    <article key={item.questionId} className="recommendation-item">
                      <div className="recommendation-head">
                        <span className={`recommendation-section section-${item.section}`}>{item.sectionLabel}</span>
                        <span className="answer-badge answer-badge-word">{item.word}</span>
                        {item.partOfSpeech && (
                          <span className={`answer-badge answer-badge-pos ${buildPartOfSpeechClassName(item.partOfSpeech)}`}>
                            {item.partOfSpeech}
                          </span>
                        )}
                        <span className={`recommendation-status ${item.isDue ? 'is-due' : 'is-weak'}`}>
                          {item.isDue ? '復習期限' : '弱点候補'}
                        </span>
                      </div>
                      <p className="recommendation-meaning">{item.meaningText}</p>
                      <p className="recommendation-meta">正答率 {item.accuracy ?? 0}% / 誤答 {item.wrongCount} / 学習 {item.attempts}回</p>
                    </article>
                  ))}
                </div>
                <div className="action-row">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() =>
                      startTraining(recommendedDifficulty, {
                        section: weakestPrioritySection,
                        prioritizedQuestionIds: weakRecommendationIds,
                        sourceLabel: `${sectionLabel(weakestPrioritySection)}の弱点優先モード`
                      })
                    }
                  >
                    {sectionLabel(weakestPrioritySection)}の弱点優先5分へ
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <p className="section-label">昇格進捗</p>
                <h2>次ランクまでの進み具合</h2>
              </div>
              <span className="pill pill-primary">{rankInfo.current}{rankInfo.nextRank ? ` → ${rankInfo.nextRank}` : ' 到達済み'}</span>
            </div>
            <p className="lead-text">{rankInfo.label}</p>
            <div className="progress-block">
              <div className="progress-block-head">
                <span>総合ランク進捗</span>
                <strong>{rankInfo.progressPercent}%</strong>
              </div>
              <div className="session-meter" aria-hidden="true">
                <span className="session-meter-fill" style={{ width: `${rankInfo.progressPercent}%` }} />
              </div>
            </div>
            <div className="checkpoint-grid">
              {rankInfo.checklists.map((item) => (
                <article key={item.label} className={`checkpoint-card${item.done ? ' is-done' : ''}`}>
                  <p className="checkpoint-label">{item.label}</p>
                  <p className="checkpoint-value">{formatChecklistValue(item.current, item.target, item.unit)}</p>
                </article>
              ))}
            </div>
            <div className="section-rank-inline">
              {rankInfo.sectionRanks.map((sectionRank) => (
                <span key={sectionRank.section}>{sectionLabel(sectionRank.section)} {sectionRank.current} / 定着率 {sectionRank.masteryRate}% / 復習 {sectionRank.dueCount}問</span>
              ))}
            </div>
          </section>

          <section className="card status-grid-card">
            <div className="card-header">
              <div>
                <p className="section-label">ステータス</p>
                <h2>現在の到達度</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => setScreen('status')}>
                詳細を見る
              </button>
            </div>
            <div className="stats-grid stats-grid-wide">
              <article className="stat-card">
                <p className="stat-label">トレーニング正答率</p>
                <p className="stat-value">{formatPercent(rankInfo.trainingAccuracy)}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">ミニテスト平均</p>
                <p className="stat-value">{formatPercent(rankInfo.miniTestAccuracy)}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">疑似テスト平均</p>
                <p className="stat-value">{formatPercent(rankInfo.mockTestAccuracy)}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">次の昇格条件</p>
                <p className="stat-value stat-text">{rankInfo.nextRequirement}</p>
              </article>
            </div>
          </section>
          <section className="card">
            <div className="card-header">
              <div>
                <p className="section-label">モード</p>
                <h2>学習導線</h2>
              </div>
            </div>
            <div className="mode-grid">
              <button
                type="button"
                className="mode-card"
                onClick={() => {
                  setSelectedTrainingSection('vocab-gap');
                  setScreen('training-select');
                }}
              >
                <strong>語彙補充トレーニング</strong>
                <span>基礎 / 標準 / 実戦の5分反復</span>
              </button>
              <button
                type="button"
                className="mode-card"
                onClick={() => {
                  setSelectedTrainingSection('long-gap');
                  setScreen('training-select');
                }}
              >
                <strong>長文語句補充 β</strong>
                <span>段落の流れと接続を5分で拾う先行レーン</span>
              </button>
              <button
                type="button"
                className={`mode-card${mockUnlocked ? '' : ' is-locked'}`}
                onClick={() => setScreen('mock-intro')}
              >
                <strong>疑似テスト</strong>
                <span>
                  {mockUnlocked
                    ? '語彙18問 / 長文β8問 から選択'
                    : `解放まであと${Math.max(0, 3 - learningState.sessions.filter((session) => session.mode === 'training').length)}回のトレーニング`}
                </span>
              </button>
            </div>
            <div className="coming-soon-list">
              <span>長文読解（準備中）</span>
              <span>要約（準備中）</span>
              <span>英作文（準備中）</span>
              <span>リスニング（準備中）</span>
            </div>
          </section>
        </>
      )}

      {screen === 'training-select' && (
        <>
          <section className="card feature-card">
            <div className="card-header">
              <div>
                <p className="section-label">トレーニング選択</p>
                <h2>{sectionLabel(selectedTrainingSection)}トレーニング</h2>
              </div>
              <button type="button" className="ghost-button" onClick={navigateHome}>
                ホームへ戻る
              </button>
            </div>
            <p className="subtitle compact">{buildSectionLead(selectedTrainingSection)}</p>
          </section>
          <section className="card">
            <p className="section-label">セクション</p>
            <div className="mode-grid">
              {(TRAINING_SECTIONS as readonly SupportedTrainingSection[]).map((section) => (
                <button
                  key={section}
                  type="button"
                  className={`mode-card${selectedTrainingSection === section ? ' is-selected' : ''}`}
                  onClick={() => setSelectedTrainingSection(section)}
                >
                  <strong>{section === 'long-gap' ? '長文語句補充 β' : sectionLabel(section)}</strong>
                  <span>{buildSectionDescription(section)}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="card difficulty-card">
            <p className="section-label">難易度レーン</p>
            <div className="difficulty-grid">
              {(['basic', 'standard', 'practical'] as Difficulty[]).map((difficulty) => (
                <button
                  key={difficulty}
                  type="button"
                  className={`difficulty-option${selectedDifficulty === difficulty ? ' is-selected' : ''}`}
                  onClick={() => setSelectedDifficulty(difficulty)}
                >
                  <strong>{difficultyLabel(difficulty)}</strong>
                  <span>
                    {difficulty === 'basic' && '頻出語と素直な誤答で土台を固める'}
                    {difficulty === 'standard' && '準一級らしい文脈判断を安定させる'}
                    {difficulty === 'practical' && '紛らわしい選択肢まで含めて鍛える'}
                  </span>
                </button>
              ))}
            </div>
            <div className="action-row">
              <button type="button" className="primary-button" onClick={() => startTraining(selectedDifficulty, { section: selectedTrainingSection })}>
                {sectionLabel(selectedTrainingSection)}の5分を開始
              </button>
            </div>
          </section>
        </>
      )}

      {screen === 'training-session' && trainingRuntime && currentTrainingQuestion && (
        <section className="card quiz-card wide-card">
          <div className="card-header">
            <div>
              <p className="section-label">
                {trainingRuntime.phase === 'practice' ? '反復トレーニング' : 'ミニテスト'}
              </p>
              <h2>{sectionLabel(currentTrainingQuestion.section)}</h2>
            </div>
            <div className="session-header-meta">
              <span className="pill">{difficultyLabel(trainingRuntime.difficulty)}</span>
              <span className="pill">残り {formatCountdown(trainingRuntime.remainingSeconds)}</span>
            </div>
          </div>

          <div className="session-meter" aria-hidden="true">
            <span className="session-meter-fill" style={{ width: `${trainingLiveStats.progressPercent}%` }} />
          </div>

          {sessionStatusMessage && <p className="note note-info">{sessionStatusMessage}</p>}

          <div className="session-progress-row">
            <span>経過 {formatCountdown(TRAINING_TIME_LIMIT_SECONDS - trainingRuntime.remainingSeconds)}</span>
            <span>反復ラップ {trainingLiveStats.roundDisplay}</span>
            <span>反復 {trainingLiveStats.practiceAnswered}問 / 判定 {trainingLiveStats.miniAnswered}問</span>
          </div>

          <div className="coach-panel">
            <p className="coach-label">JUNICHI ナビ</p>
            <p className="coach-text">{trainingCoachMessage}</p>
            <div className="coach-meta">
              <span>
                {currentTrainingSummary?.attempts
                  ? `過去 ${currentTrainingSummary.attempts} 回学習済み`
                  : '初見または先取り問題'}
              </span>
              <span>{currentTrainingSummary?.isDue ? '復習対象' : '新規 / 先取り'}</span>
              <span>
                {trainingRuntime.phase === 'practice'
                  ? `反復正答 ${trainingLiveStats.practiceCorrect}/${Math.max(trainingLiveStats.practiceAnswered, 1)}`
                  : `判定進捗 ${trainingLiveStats.miniAnswered + 1}/${trainingRuntime.miniTestQuestions.length}`}
              </span>
            </div>
          </div>

          {trainingRuntime.miniTestPending ? (
            <div className="mini-test-intro-panel">
              <p className="mini-test-intro-label">終盤モードへ切替</p>
              <h3>ここから3問ミニテストです</h3>
              <p className="mini-test-intro-text">
                ここから先は、その場で正解・不正解を返さず、3問まとめて現在地を測ります。
              </p>
              <ul className="mini-test-intro-list">
                <li>選んだ選択肢は、次へを押すまで変更できます。</li>
                <li>採点と振り返りは、3問終了後にまとめて表示します。</li>
              </ul>
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  setTrainingRuntime((current) =>
                    current
                      ? {
                          ...current,
                          miniTestPending: false
                        }
                      : current
                  );
                  setSelectedChoiceIndex(null);
                  setShowTrainingFeedback(false);
                  setSessionStatusMessage('ミニテスト開始。ここからは3問連続で現在地を測ります。');
                }}
              >
                3問ミニテストを開始
              </button>
            </div>
          ) : (
            <>
              <div className="question-panel">
                <p className="question-prompt">{currentTrainingQuestion.prompt}</p>
                <button
                  className={`speak-button${!speechService.isAvailable() ? ' is-unavailable' : ''}${speechPlaying ? ' is-playing' : ''}`}
                  type="button"
                  onClick={() => onSpeak(currentTrainingQuestion)}
                >
                  {speechPlaying ? '🔊 再生中…' : speechReady ? '🔁 もう一度読み上げ' : '🔊 英文を読み上げ'}
                </button>
                {speechStatusMessage && <p className="note note-error">{speechStatusMessage}</p>}

                {trainingRuntime.phase === 'practice' && showTrainingFeedback && (
                  <div className="answer-panel" data-status={selectedChoiceIndex === currentTrainingQuestion.answerIndex ? 'correct' : 'wrong'}>
                    <div className="answer-badges">
                      <span className={`answer-badge answer-badge-status ${selectedChoiceIndex === currentTrainingQuestion.answerIndex ? 'is-correct' : 'is-review'}`}>
                        {selectedChoiceIndex === currentTrainingQuestion.answerIndex ? '正解' : '要復習'}
                      </span>
                    </div>
                    <div className="answer-term-row">
                      <span className="answer-badge answer-badge-word">{buildAnswerWordLabel(currentTrainingQuestion)}</span>
                      {buildAnswerPartOfSpeechLabel(currentTrainingQuestion) && (
                        <span
                          className={`answer-badge answer-badge-pos ${buildPartOfSpeechClassName(buildAnswerPartOfSpeechLabel(currentTrainingQuestion))}`}
                        >
                          {buildAnswerPartOfSpeechLabel(currentTrainingQuestion)}
                        </span>
                      )}
                    </div>
                    <p className="answer-detail">
                      <strong className="answer-detail-strong answer-meaning-text">{buildAnswerMeaningText(currentTrainingQuestion)}</strong>
                    </p>
                    {currentTrainingQuestion.translation && (
                      <p className="answer-subdetail">
                        <span className="answer-badge answer-badge-translation">訳</span>
                        <span className="answer-translation-text">{currentTrainingQuestion.translation}</span>
                      </p>
                    )}
                  </div>
                )}

                {trainingRuntime.phase === 'mini-test' && selectedTrainingChoice && (
                  <div className="selection-panel">
                    <p className="selection-heading">選択中</p>
                    <p className="selection-detail">{selectedTrainingChoice}</p>
                    <p className="selection-subdetail">次へを押すまで確定しません。別の選択肢へ変更できます。</p>
                  </div>
                )}

              </div>

              <div className="choices">
                {currentTrainingQuestion.choices.map((choice, index) => {
                  const isSelected = selectedChoiceIndex === index;
                  const showCorrect =
                    trainingRuntime.phase === 'practice' && showTrainingFeedback && index === currentTrainingQuestion.answerIndex;
                  const showWrong =
                    trainingRuntime.phase === 'practice' && showTrainingFeedback && isSelected && index !== currentTrainingQuestion.answerIndex;
                  return (
                    <button
                      key={`${currentTrainingQuestion.id}-${choice}`}
                      type="button"
                      className={`choice${showCorrect ? ' correct' : ''}${showWrong ? ' wrong' : ''}${isSelected ? ' is-selected' : ''}`}
                      disabled={trainingRuntime.phase === 'practice' && showTrainingFeedback}
                      onClick={() => handleTrainingChoice(index)}
                    >
                      {choice}
                    </button>
                  );
                })}
              </div>
            </>
          )}


          {trainingRuntime.phase === 'mini-test' && !trainingRuntime.miniTestPending && (
            <p className="note note-warning">
              判定モードでは途中解説を出しません。選択肢を決めたら次へ進み、最後にまとめて振り返ります。
            </p>
          )}

          {!trainingRuntime.miniTestPending && (
          <div className="action-row">
            <button type="button" className="ghost-button" onClick={navigateHome}>
              中断してホームへ
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={trainingRuntime.phase === 'practice' ? !showTrainingFeedback : selectedChoiceIndex === null}
              onClick={advanceTraining}
            >
              {trainingRuntime.phase === 'mini-test' && trainingRuntime.currentIndex === trainingRuntime.miniTestQuestions.length - 1
                ? '結果を見る'
                : trainingRuntime.phase === 'practice' && trainingRuntime.currentIndex === trainingRuntime.practiceQuestions.length - 1
                  ? trainingRuntime.remainingSeconds <= TRAINING_MINI_TEST_TRIGGER_SECONDS
                    ? '判定テストへ'
                    : '次の反復ラップへ'
                  : '次へ'}
            </button>
          </div>
          )}
        </section>
      )}

      {screen === 'training-result' && lastTrainingResult && (
        <>
          <section className="card feature-card">
            <div className="card-header">
              <div>
                <p className="section-label">トレーニング結果</p>
                <h2>{difficultyLabel(lastTrainingResult.summary.difficulty)} 5分セッション完了</h2>
              </div>
              <span className="pill pill-primary">総合 {lastTrainingResult.summary.overallAccuracy}%</span>
            </div>
            {lastTrainingResult.endedReason === 'time-up' && (
              <p className="note note-warning">制限時間で終了しました。ここまでの積み上げをそのまま記録しています。</p>
            )}
            {lastTrainingResult.promotionMessage && <p className="note note-success">{lastTrainingResult.promotionMessage}</p>}
            <div className="progress-block">
              <div className="progress-block-head">
                <span>次ランクまで</span>
                <strong>{lastTrainingResult.rankInfo.progressPercent}%</strong>
              </div>
              <div className="session-meter" aria-hidden="true">
                <span className="session-meter-fill" style={{ width: `${lastTrainingResult.rankInfo.progressPercent}%` }} />
              </div>
            </div>
            <div className="stats-grid stats-grid-wide">
              <article className="stat-card">
                <p className="stat-label">反復トレ</p>
                <p className="stat-value">
                  {lastTrainingResult.summary.practiceCorrect} / {lastTrainingResult.summary.practiceTotal}
                </p>
              </article>
              <article className="stat-card">
                <p className="stat-label">ミニテスト</p>
                <p className="stat-value">
                  {lastTrainingResult.summary.miniCorrect} / {lastTrainingResult.summary.miniTotal}
                </p>
              </article>
              <article className="stat-card">
                <p className="stat-label">反復ラップ数</p>
                <p className="stat-value">{lastTrainingResult.completedPracticeRounds}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">現在ランク</p>
                <p className="stat-value">{lastTrainingResult.rankInfo.current}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">所要時間</p>
                <p className="stat-value">{formatCountdown(lastTrainingResult.summary.durationSeconds)}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">次の条件</p>
                <p className="stat-value stat-text">{lastTrainingResult.rankInfo.nextRequirement}</p>
              </article>
            </div>
            <p className="note note-success">{buildTrainingResultMessage(lastTrainingResult)}</p>
          </section>
          <section className="card">
            <div className="card-header">
              <div>
                <p className="section-label">復習候補</p>
                <h2>今回の取りこぼし</h2>
              </div>
            </div>
            {lastTrainingResult.wrongQuestions.length === 0 ? (
              <p className="note note-success">今回の5分では取りこぼしなしです。この状態で次のラップへ入れます。</p>
            ) : (
              <div className="review-list">
                {lastTrainingResult.wrongQuestions.slice(0, 4).map((question) => (
                  <article key={question.id} className="review-item">
                    <p className="review-title">{question.prompt}</p>
                    <p className="review-answer">正解: {question.choices[question.answerIndex]}</p>
                    <p className="review-detail">{question.explanation}</p>
                  </article>
                ))}
              </div>
            )}
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                onClick={() => startTraining(getRecommendedDifficulty(learningState))}
              >
                次の5分へ進む
              </button>
              {lastTrainingResult.wrongQuestions.length > 0 && (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    startTraining(recommendedDifficulty, {
                      prioritizedQuestionIds: lastTrainingResult.wrongQuestions.map((question) => question.id),
                      sourceLabel: '今回の取りこぼし優先モード'
                    })
                  }
                >
                  取りこぼし優先の5分へ
                </button>
              )}
              <button type="button" className="ghost-button" onClick={navigateHome}>
                ホームへ戻る
              </button>
            </div>
          </section>
        </>
      )}

      {screen === 'mock-intro' && (
        <>
          <section className="card feature-card">
            <div className="card-header">
              <div>
                <p className="section-label">疑似テスト</p>
                <h2>{selectedMockConfig.title}</h2>
              </div>
              <button type="button" className="ghost-button" onClick={navigateHome}>
                ホームへ戻る
              </button>
            </div>
            <p className="subtitle compact">{selectedMockConfig.introDescription}</p>
          </section>
          <section className="card">
            <p className="section-label">セクション</p>
            <div className="mode-grid">
              {(TRAINING_SECTIONS as readonly SupportedTrainingSection[]).map((section) => {
                const config = getMockSectionConfig(section);
                return (
                  <button
                    key={section}
                    type="button"
                    className={`mode-card${selectedMockSection === section ? ' is-selected' : ''}`}
                    onClick={() => setSelectedMockSection(section)}
                  >
                    <strong>{config.title}</strong>
                    <span>{buildMockSectionDescription(section)}</span>
                  </button>
                );
              })}
            </div>
          </section>
          <section className="card">
            <div className="stats-grid stats-grid-wide">
              <article className="stat-card">
                <p className="stat-label">問題数</p>
                <p className="stat-value">{selectedMockConfig.questionCount}問</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">制限時間</p>
                <p className="stat-value">{Math.floor(selectedMockConfig.timeLimitSeconds / 60)}分</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">解放条件</p>
                <p className="stat-value">5分トレーニング3回</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">達成度</p>
                <p className="stat-value">{learningState.sessions.filter((session) => session.mode === 'training').length} / 3</p>
              </article>
            </div>
            {!mockUnlocked && (
              <p className="note note-warning">
                あと {Math.max(0, 3 - learningState.sessions.filter((session) => session.mode === 'training').length)} 回のトレーニングで解放されます。
              </p>
            )}
            <div className="action-row">
              <button type="button" className="primary-button" disabled={!mockUnlocked} onClick={startMockTest}>
                {selectedMockConfig.shortLabel} を開始
              </button>
              {!mockUnlocked && (
                <button type="button" className="ghost-button" onClick={() => startTraining(recommendedDifficulty, { section: selectedMockSection })}>
                  先に5分トレーニングへ
                </button>
              )}
            </div>
          </section>
        </>
      )}

      {screen === 'mock-session' && mockRuntime && currentMockQuestion && (
        <section className="card quiz-card wide-card">
          <div className="card-header">
            <div>
              <p className="section-label">疑似テスト</p>
              <h2>{getMockSectionConfig(mockRuntime.section).title}</h2>
            </div>
            <div className="session-header-meta">
              <span className="pill">
                問題 {mockRuntime.currentIndex + 1} / {mockRuntime.questions.length}
              </span>
              <span className="pill">残り {formatCountdown(mockRuntime.remainingSeconds)}</span>
            </div>
          </div>
          <div className="session-meter" aria-hidden="true">
            <span className="session-meter-fill" style={{ width: `${mockProgressPercent}%` }} />
          </div>
          {sessionStatusMessage && <p className="note note-info">{sessionStatusMessage}</p>}
          <p className="note note-warning">{getMockSectionConfig(mockRuntime.section).sessionWarning}</p>
          <p className="question-prompt">{currentMockQuestion.prompt}</p>
          <button
            className={`speak-button${!speechService.isAvailable() ? ' is-unavailable' : ''}${speechPlaying ? ' is-playing' : ''}`}
            type="button"
            onClick={() => onSpeak(currentMockQuestion)}
          >
            {speechPlaying ? '🔊 再生中…' : speechReady ? '🔁 もう一度読み上げ' : '🔊 英文を読み上げ'}
          </button>
          {selectedMockChoice && (
            <div className="selection-panel">
              <p className="selection-heading">選択中</p>
              <p className="selection-detail">{selectedMockChoice}</p>
              <p className="selection-subdetail">次へを押すまで確定しません。別の選択肢へ変更できます。</p>
            </div>
          )}
          <div className="choices">
            {currentMockQuestion.choices.map((choice, index) => (
              <button
                key={`${currentMockQuestion.id}-${choice}`}
                type="button"
                className={`choice${selectedChoiceIndex === index ? ' is-selected' : ''}`}
                onClick={() => handleMockChoice(index)}
              >
                {choice}
              </button>
            ))}
          </div>
          <div className="action-row">
            <button type="button" className="ghost-button" onClick={() => finalizeMockTest('completed')}>
              ここまでで採点
            </button>
            <button type="button" className="primary-button" disabled={selectedChoiceIndex === null} onClick={advanceMock}>
              {mockRuntime.currentIndex === mockRuntime.questions.length - 1 ? '提出して結果を見る' : '次へ'}
            </button>
          </div>
        </section>
      )}

      {screen === 'mock-result' && lastMockResult && (
        <>
          <section className="card feature-card">
            <div className="card-header">
              <div>
                <p className="section-label">疑似テスト結果</p>
                <h2>{getMockSectionConfig(lastMockResult.section).resultHeading}</h2>
              </div>
              <span className="pill pill-primary">正答率 {lastMockResult.mockRecord.accuracy}%</span>
            </div>
            {lastMockResult.promotionMessage && <p className="note note-success">{lastMockResult.promotionMessage}</p>}
            <div className="progress-block">
              <div className="progress-block-head">
                <span>次ランクまで</span>
                <strong>{lastMockResult.rankInfo.progressPercent}%</strong>
              </div>
              <div className="session-meter" aria-hidden="true">
                <span className="session-meter-fill" style={{ width: `${lastMockResult.rankInfo.progressPercent}%` }} />
              </div>
            </div>
            <div className="stats-grid stats-grid-wide">
              <article className="stat-card">
                <p className="stat-label">得点</p>
                <p className="stat-value">
                  {lastMockResult.mockRecord.correctAnswers} / {lastMockResult.mockRecord.totalQuestions}
                </p>
              </article>
              <article className="stat-card">
                <p className="stat-label">現在ランク</p>
                <p className="stat-value">{lastMockResult.rankInfo.current}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">疑似テスト平均</p>
                <p className="stat-value">{formatPercent(lastMockResult.rankInfo.mockTestAccuracy)}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">次の条件</p>
                <p className="stat-value stat-text">{lastMockResult.rankInfo.nextRequirement}</p>
              </article>
            </div>
          </section>
          <section className="card">
            <div className="card-header">
              <div>
                <p className="section-label">復習候補</p>
                <h2>今回の取りこぼし</h2>
              </div>
            </div>
            {lastMockResult.wrongQuestions.length === 0 ? (
              <p className="note note-success">取りこぼしなし。かなり良い状態です。</p>
            ) : (
              <div className="review-list">
                {lastMockResult.wrongQuestions.slice(0, 5).map((question) => (
                  <article key={question.id} className="review-item">
                    <p className="review-title">{question.prompt}</p>
                    <p className="review-answer">正解: {question.choices[question.answerIndex]}</p>
                    <p className="review-detail">{question.explanation}</p>
                  </article>
                ))}
              </div>
            )}
            <div className="action-row">
              <button
                type="button"
                className="primary-button"
                onClick={() =>
                  startTraining(recommendedDifficulty, {
                    section: lastMockResult.section,
                    prioritizedQuestionIds: lastMockResult.wrongQuestions.map((question) => question.id),
                    sourceLabel: getMockSectionConfig(lastMockResult.section).weaknessModeLabel
                  })
                }
              >
                弱点補強の5分へ
              </button>
              <button type="button" className="ghost-button" onClick={navigateHome}>
                ホームへ戻る
              </button>
            </div>
          </section>
        </>
      )}

      {screen === 'status' && (
        <>
          <section className="card feature-card">
            <div className="card-header">
              <div>
                <p className="section-label">ステータス画面</p>
                <h2>JUNICHI 独自ランク</h2>
              </div>
              <button type="button" className="ghost-button" onClick={navigateHome}>
                ホームへ戻る
              </button>
            </div>
            <p className="lead-text">{rankInfo.current} — {rankInfo.label}</p>
            <p className="note note-info">次の昇格条件: {rankInfo.nextRequirement}</p>
            <div className="progress-block">
              <div className="progress-block-head">
                <span>総合ランク進捗</span>
                <strong>{rankInfo.progressPercent}%</strong>
              </div>
              <div className="session-meter" aria-hidden="true">
                <span className="session-meter-fill" style={{ width: `${rankInfo.progressPercent}%` }} />
              </div>
            </div>
            <div className="checkpoint-grid">
              {rankInfo.checklists.map((item) => (
                <article key={item.label} className={`checkpoint-card${item.done ? ' is-done' : ''}`}>
                  <p className="checkpoint-label">{item.label}</p>
                  <p className="checkpoint-value">{formatChecklistValue(item.current, item.target, item.unit)}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="card status-grid-card">
            <div className="card-header">
              <div>
                <p className="section-label">総合指標</p>
                <h2>現在の到達度</h2>
              </div>
              <span className="pill">主ランク {rankInfo.current}</span>
            </div>
            <div className="stats-grid stats-grid-wide">
              <article className="stat-card">
                <p className="stat-label">連続学習日数</p>
                <p className="stat-value">{rankInfo.streak.current}日</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">最長連続</p>
                <p className="stat-value">{rankInfo.streak.longest}日</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">トレーニング回数</p>
                <p className="stat-value">{learningState.sessions.filter((session) => session.mode === 'training').length}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">復習対象</p>
                <p className="stat-value">{dueCount}問</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">語彙トレ正答率</p>
                <p className="stat-value">{formatPercent(rankInfo.trainingAccuracy)}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">ミニテスト平均</p>
                <p className="stat-value">{formatPercent(rankInfo.miniTestAccuracy)}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">疑似テスト平均</p>
                <p className="stat-value">{formatPercent(rankInfo.mockTestAccuracy)}</p>
              </article>
              <article className="stat-card">
                <p className="stat-label">最新ミニテスト</p>
                <p className="stat-value">{latestMiniTest ? `${latestMiniTest.correctAnswers}/${latestMiniTest.totalQuestions}` : '未実施'}</p>
              </article>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <p className="section-label">セクション別ランク</p>
                <h2>語彙補充 / 長文語句補充β の進捗</h2>
              </div>
              <span className="pill pill-primary">2セクション統合</span>
            </div>
            <div className="section-rank-cards">
              {rankInfo.sectionRanks.map((sectionRank) => (
                <article key={sectionRank.section} className="section-rank-card">
                  <div className="section-rank-head">
                    <div>
                      <p className="section-label">{sectionLabel(sectionRank.section)}</p>
                      <h3>{sectionRank.current}</h3>
                    </div>
                    <span className="pill">{sectionRank.progressPercent}%</span>
                  </div>
                  <p className="lead-text">{sectionRank.label}</p>
                  <div className="progress-block">
                    <div className="progress-block-head">
                      <span>{sectionLabel(sectionRank.section)}進捗</span>
                      <strong>{sectionRank.progressPercent}%</strong>
                    </div>
                    <div className="session-meter" aria-hidden="true">
                      <span className="session-meter-fill" style={{ width: `${sectionRank.progressPercent}%` }} />
                    </div>
                  </div>
                  <div className="stats-grid stats-grid-wide">
                    <article className="stat-card">
                      <p className="stat-label">学習済み</p>
                      <p className="stat-value">{sectionRank.attemptedQuestions}問</p>
                    </article>
                    <article className="stat-card">
                      <p className="stat-label">定着率</p>
                      <p className="stat-value">{sectionRank.masteryRate}%</p>
                    </article>
                    <article className="stat-card">
                      <p className="stat-label">復習対象</p>
                      <p className="stat-value">{sectionRank.dueCount}問</p>
                    </article>
                    <article className="stat-card">
                      <p className="stat-label">次の条件</p>
                      <p className="stat-value stat-text">{sectionRank.nextRequirement}</p>
                    </article>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <p className="section-label">直近セッション</p>
                <h2>最近の学習ログ</h2>
              </div>
            </div>
            {recentSessions.length === 0 ? (
              <p className="note note-info">まだセッション履歴はありません。まずはおすすめ5分から始めましょう。</p>
            ) : (
              <div className="recent-session-list">
                {recentSessions.map((session) => (
                  <article key={session.id} className="recent-session-item">
                    <div>
                      <p className="recent-session-title">{buildSessionLabel(session)}</p>
                      <p className="recent-session-subtitle">{new Date(session.completedAt).toLocaleString('ja-JP')}</p>
                    </div>
                    <div className="recent-session-metrics">
                      <span>{session.correctAnswers}/{session.totalQuestions}</span>
                      <strong>{session.accuracy}%</strong>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <div className="action-row">
              <button type="button" className="primary-button" onClick={() => startTraining(recommendedDifficulty, { section: 'vocab-gap' })}>
                おすすめ5分へ
              </button>
              <button type="button" className="ghost-button" onClick={resetAllLearningData}>
                学習データをリセット
              </button>
            </div>
          </section>
        </>
      )}

      {voiceDebugLabel && <p className="voice-debug-footer">DEV voice: {voiceDebugLabel}</p>}
      <p className="build-version">build {appBuildVersion}</p>
    </main>
  );
}

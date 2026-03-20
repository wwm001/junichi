import { createInitialProgress, isDue, updateProgress } from './spacedRepetition';
import type {
  AppProgress,
  Difficulty,
  LearningState,
  Question,
  QuestionProgressSummary,
  RankCheckpoint,
  RankInfo,
  ReviewRating,
  SectionRankInfo,
  SessionRecord,
  StreakInfo,
  TestRecord,
  WeakRecommendation
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const rankOrder = ['J5', 'J4', 'J3', 'J2', 'J1', 'S'] as const;
type RankKey = (typeof rankOrder)[number];

type RankRule = {
  rank: RankKey;
  description: string;
  nextRank: 'J4' | 'J3' | 'J2' | 'J1' | 'S' | null;
  nextRequirement: string;
  checklists: Omit<RankCheckpoint, 'done'>[];
};

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

function escapeForRegExp(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function buildMeaningText(question: Question): string {
  const answer = question.choices[question.answerIndex];
  let normalized = question.explanation.replace(new RegExp(`^${escapeForRegExp(answer)}\\s*は\\s*`), '').trim();
  normalized = normalized.replace(/[「」]/g, '').replace(/^[:：]/, '').trim();
  return normalized;
}

function startOfDay(timestamp: string): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function averageAccuracy(records: Array<{ accuracy: number }>): number {
  if (records.length === 0) return 0;
  return Math.round(records.reduce((sum, r) => sum + r.accuracy, 0) / records.length);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function computeChecklistProgress(checklists: Omit<RankCheckpoint, 'done'>[]): RankCheckpoint[] {
  return checklists.map((item) => ({
    ...item,
    done: item.current >= item.target
  }));
}

function computeProgressPercent(checklists: RankCheckpoint[]): number {
  if (checklists.length === 0) return 100;
  const total = checklists.reduce((sum, item) => sum + clamp((item.current / item.target) * 100, 0, 100), 0);
  return Math.round(total / checklists.length);
}

function buildRankRule(totalSessions: number, trainingAccuracy: number, miniAccuracy: number, mockAccuracy: number): RankRule {
  if (totalSessions >= 12 && mockAccuracy >= 85 && miniAccuracy >= 80) {
    return {
      rank: 'S',
      description: '本番投入可。疑似テストでも高水準を維持。',
      nextRank: null,
      nextRequirement: '最上位ランク到達済み',
      checklists: []
    };
  }
  if (totalSessions >= 8 && mockAccuracy >= 70 && miniAccuracy >= 75) {
    return {
      rank: 'J1',
      description: '合格射程圏。模試で戦えるラインへ接近。',
      nextRank: 'S',
      nextRequirement: '疑似テスト平均85%以上、ミニテスト平均80%以上',
      checklists: [
        { label: 'トレ回数', current: totalSessions, target: 12, unit: '回' },
        { label: '疑似テスト平均', current: mockAccuracy, target: 85, unit: '%' },
        { label: 'ミニテスト平均', current: miniAccuracy, target: 80, unit: '%' }
      ]
    };
  }
  if (totalSessions >= 6 && miniAccuracy >= 70) {
    return {
      rank: 'J2',
      description: '準1級接近。本番形式の負荷に耐え始めている。',
      nextRank: 'J1',
      nextRequirement: 'トレーニング累計8回、疑似テスト平均70%以上、ミニテスト平均75%以上',
      checklists: [
        { label: 'トレ回数', current: totalSessions, target: 8, unit: '回' },
        { label: '疑似テスト平均', current: mockAccuracy, target: 70, unit: '%' },
        { label: 'ミニテスト平均', current: miniAccuracy, target: 75, unit: '%' }
      ]
    };
  }
  if (totalSessions >= 4 && miniAccuracy >= 60) {
    return {
      rank: 'J3',
      description: '標準定着。準一級らしい語彙判断が安定し始めた状態。',
      nextRank: 'J2',
      nextRequirement: 'トレーニング累計6回、ミニテスト平均70%以上',
      checklists: [
        { label: 'トレ回数', current: totalSessions, target: 6, unit: '回' },
        { label: 'ミニテスト平均', current: miniAccuracy, target: 70, unit: '%' }
      ]
    };
  }
  if (totalSessions >= 2 || trainingAccuracy >= 55) {
    return {
      rank: 'J4',
      description: '基礎巡航。頻出語を取りこぼさない土台作り。',
      nextRank: 'J3',
      nextRequirement: 'トレーニング累計4回、ミニテスト平均60%以上',
      checklists: [
        { label: 'トレ回数', current: totalSessions, target: 4, unit: '回' },
        { label: 'ミニテスト平均', current: miniAccuracy, target: 60, unit: '%' }
      ]
    };
  }
  return {
    rank: 'J5',
    description: '覚醒前。まずは5分反復を習慣化する段階。',
    nextRank: 'J4',
    nextRequirement: 'トレーニング2回 または 語彙トレ正答率55%以上',
    checklists: [
      { label: 'トレ回数', current: totalSessions, target: 2, unit: '回' },
      { label: '語彙トレ正答率', current: trainingAccuracy, target: 55, unit: '%' }
    ]
  };
}

function computeSectionRankInfo(state: LearningState): SectionRankInfo {
  const entries = Object.values(state.progress.entries);
  const attemptedEntries = entries.filter((entry) => entry.correctCount + entry.wrongCount > 0);
  const attemptedQuestions = attemptedEntries.length;
  const masteredQuestions = attemptedEntries.filter((entry) => {
    const attempts = entry.correctCount + entry.wrongCount;
    const accuracy = attempts === 0 ? 0 : (entry.correctCount / attempts) * 100;
    return attempts >= 2 && accuracy >= 80;
  }).length;
  const masteryRate = attemptedQuestions === 0 ? 0 : Math.round((masteredQuestions / attemptedQuestions) * 100);
  const dueCount = attemptedEntries.filter((entry) => isDue(entry)).length;

  let current: RankKey = 'J5';
  let nextRequirement = 'まずは4語以上に触れて、語感と意味を結びつける';
  let progressPercent = clamp(Math.round(((attemptedQuestions / 4) * 50) + ((masteryRate / 20) * 50)), 0, 100);

  if (attemptedQuestions >= 20 && masteryRate >= 80 && dueCount <= 2) {
    current = 'S';
    nextRequirement = '語彙セクション最上位に到達済み';
    progressPercent = 100;
  } else if (attemptedQuestions >= 16 && masteryRate >= 68) {
    current = 'J1';
    nextRequirement = '学習語16語以上、定着率80%以上、復習対象2語以下';
    progressPercent = clamp(Math.round(((attemptedQuestions / 20) * 40) + ((masteryRate / 80) * 40) + (((Math.max(0, 6 - dueCount)) / 6) * 20)), 0, 100);
  } else if (attemptedQuestions >= 12 && masteryRate >= 55) {
    current = 'J2';
    nextRequirement = '学習語16語以上、定着率68%以上';
    progressPercent = clamp(Math.round(((attemptedQuestions / 16) * 50) + ((masteryRate / 68) * 50)), 0, 100);
  } else if (attemptedQuestions >= 8 && masteryRate >= 40) {
    current = 'J3';
    nextRequirement = '学習語12語以上、定着率55%以上';
    progressPercent = clamp(Math.round(((attemptedQuestions / 12) * 50) + ((masteryRate / 55) * 50)), 0, 100);
  } else if (attemptedQuestions >= 4 || masteryRate >= 20) {
    current = 'J4';
    nextRequirement = '学習語8語以上、定着率40%以上';
    progressPercent = clamp(Math.round(((attemptedQuestions / 8) * 50) + ((masteryRate / 40) * 50)), 0, 100);
  }

  const labels: Record<RankKey, string> = {
    J5: '未整備。まずは語感と意味をつなぐ段階。',
    J4: '語感接続。見た語を取りこぼしにくくなってきた。',
    J3: '定着前夜。頻出語が素直に取れ始めている。',
    J2: '定着巡航。文脈に引っ張られず語義を判断できる。',
    J1: '本番接近。語彙セクションが得点源になり始めた。',
    S: '語彙本番投入可。安定して拾い切れる状態。'
  };

  return {
    section: 'vocab-gap',
    current,
    label: labels[current],
    attemptedQuestions,
    masteryRate,
    dueCount,
    progressPercent,
    nextRequirement
  };
}

export function pickAutoRating(isCorrect: boolean): ReviewRating {
  return isCorrect ? 'good' : 'again';
}

export function buildProgressSummary(question: Question, progress: AppProgress, now = new Date()): QuestionProgressSummary {
  const entry = progress.entries[question.id] ?? createInitialProgress(question.id, now);
  const attempts = entry.correctCount + entry.wrongCount;
  const accuracy = attempts === 0 ? null : Math.round((entry.correctCount / attempts) * 100);
  return { questionId: question.id, attempts, accuracy, isDue: isDue(entry, now), wrongCount: entry.wrongCount, correctCount: entry.correctCount };
}

export function updateQuestionProgress(progress: AppProgress, question: Question, isCorrect: boolean, now = new Date()): AppProgress {
  const currentEntry = progress.entries[question.id] ?? createInitialProgress(question.id, now);
  const updatedEntry = updateProgress(currentEntry, pickAutoRating(isCorrect), now);
  return { entries: { ...progress.entries, [question.id]: updatedEntry }, totalAnswered: progress.totalAnswered + 1, totalCorrect: progress.totalCorrect + (isCorrect ? 1 : 0) };
}

export function finalizeLearningState(state: LearningState, partial: { progress?: AppProgress; addSession?: SessionRecord; addMiniTest?: TestRecord; addMockTest?: TestRecord; }): LearningState {
  return {
    ...state,
    progress: partial.progress ?? state.progress,
    sessions: partial.addSession ? [...state.sessions, partial.addSession] : state.sessions,
    miniTests: partial.addMiniTest ? [...state.miniTests, partial.addMiniTest] : state.miniTests,
    mockTests: partial.addMockTest ? [...state.mockTests, partial.addMockTest] : state.mockTests
  };
}

export function computeStreakInfo(sessions: SessionRecord[]): StreakInfo {
  if (sessions.length === 0) return { current: 0, longest: 0, lastStudiedOn: null };
  const uniqueDays = [...new Set(sessions.map((s) => startOfDay(s.completedAt)))].sort((a, b) => a - b);
  let longest = 1;
  let run = 1;
  for (let i = 1; i < uniqueDays.length; i += 1) {
    if (uniqueDays[i] - uniqueDays[i - 1] === DAY_MS) { run += 1; longest = Math.max(longest, run); } else { run = 1; }
  }
  let current = 1;
  for (let i = uniqueDays.length - 1; i > 0; i -= 1) {
    if (uniqueDays[i] - uniqueDays[i - 1] === DAY_MS) current += 1; else break;
  }
  return { current, longest, lastStudiedOn: new Date(uniqueDays[uniqueDays.length - 1]).toISOString() };
}

function difficultyLabel(difficulty: Difficulty): string {
  return difficulty === 'basic' ? '基礎' : difficulty === 'standard' ? '標準' : '実戦';
}

export function computeRankInfo(state: LearningState): RankInfo {
  const streak = computeStreakInfo(state.sessions);
  const trainingSessions = state.sessions.filter((s) => s.mode === 'training');
  const trainingAccuracy = averageAccuracy(trainingSessions);
  const miniAccuracy = averageAccuracy(state.miniTests);
  const mockAccuracy = averageAccuracy(state.mockTests);
  const totalSessions = trainingSessions.length;

  const rankRule = buildRankRule(totalSessions, trainingAccuracy, miniAccuracy, mockAccuracy);
  const checklists = computeChecklistProgress(rankRule.checklists);
  const sectionRank = computeSectionRankInfo(state);

  return {
    current: rankRule.rank,
    label: rankRule.description,
    nextRank: rankRule.nextRank,
    nextRequirement: rankRule.nextRequirement,
    trainingAccuracy,
    miniTestAccuracy: miniAccuracy,
    mockTestAccuracy: mockAccuracy,
    streak,
    progressPercent: computeProgressPercent(checklists),
    checklists,
    sectionRank
  };
}

export function getRecommendedDifficulty(state: LearningState): Difficulty {
  const trainingSessions = state.sessions.filter((s) => s.mode === 'training');
  const latest = trainingSessions[trainingSessions.length - 1];
  if (!latest) return 'basic';
  if (latest.accuracy >= 85 && latest.difficulty === 'standard') return 'practical';
  if (latest.accuracy >= 80 && latest.difficulty === 'basic') return 'standard';
  if (latest.accuracy < 55) return 'basic';
  return latest.difficulty ?? 'standard';
}

export function isMockTestUnlocked(state: LearningState): boolean {
  return state.sessions.filter((s) => s.mode === 'training').length >= 3;
}

export function buildNextActionLabel(state: LearningState): string {
  const difficulty = getRecommendedDifficulty(state);
  const dueCount = Object.values(state.progress.entries).filter((entry) => isDue(entry)).length;
  if (dueCount >= 5) return `復習優先の${difficultyLabel(difficulty)}トレーニング`;
  if (!isMockTestUnlocked(state)) return `疑似テスト解放へ向けた${difficultyLabel(difficulty)}トレーニング`;
  return `${difficultyLabel(difficulty)}トレーニングで5分反復`;
}

export function buildWeaknessHint(questions: Question[], state: LearningState): string {
  const weakest = questions
    .map((q) => ({ q, s: buildProgressSummary(q, state.progress) }))
    .filter(({ s }) => s.attempts > 0)
    .sort((a, b) => (a.s.accuracy ?? 100) - (b.s.accuracy ?? 100) || b.s.wrongCount - a.s.wrongCount)[0];
  if (!weakest) return '初回学習フェーズ。まずは基礎レーンから着手。';
  return `弱点候補: ${weakest.q.choices[weakest.q.answerIndex]}（正答率 ${weakest.s.accuracy ?? 0}%）`;
}

export function getWeakRecommendations(questions: Question[], state: LearningState, limit = 3): WeakRecommendation[] {
  return questions
    .map((question) => ({
      question,
      summary: buildProgressSummary(question, state.progress)
    }))
    .filter(({ summary }) => summary.attempts > 0)
    .sort((a, b) => {
      const aScore = (a.summary.isDue ? -1000 : 0) + (a.summary.accuracy ?? 100) - a.summary.wrongCount * 3;
      const bScore = (b.summary.isDue ? -1000 : 0) + (b.summary.accuracy ?? 100) - b.summary.wrongCount * 3;
      return aScore - bScore || (a.summary.accuracy ?? 100) - (b.summary.accuracy ?? 100) || b.summary.wrongCount - a.summary.wrongCount;
    })
    .slice(0, limit)
    .map(({ question, summary }) => ({
      questionId: question.id,
      word: question.choices[question.answerIndex],
      meaningText: buildMeaningText(question),
      translation: question.translation ?? '',
      partOfSpeech: PART_OF_SPEECH_MAP[question.choices[question.answerIndex]] ?? '',
      accuracy: summary.accuracy,
      attempts: summary.attempts,
      wrongCount: summary.wrongCount,
      isDue: summary.isDue
    }));
}

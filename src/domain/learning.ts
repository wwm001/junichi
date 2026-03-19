import { createInitialProgress, isDue, updateProgress } from './spacedRepetition';
import type { AppProgress, Difficulty, LearningState, Question, QuestionProgressSummary, RankInfo, ReviewRating, SessionRecord, StreakInfo, TestRecord } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
const rankOrder = ['J5', 'J4', 'J3', 'J2', 'J1', 'S'] as const;
type RankKey = (typeof rankOrder)[number];

function startOfDay(timestamp: string): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
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

function averageAccuracy(records: Array<{ accuracy: number }>): number {
  if (records.length === 0) return 0;
  return Math.round(records.reduce((sum, r) => sum + r.accuracy, 0) / records.length);
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
  let rank: RankKey = 'J5';
  let nextRank: RankKey | null = 'J4';
  let nextRequirement = '5分トレーニングをあと1回完了する';
  if (totalSessions >= 12 && mockAccuracy >= 85 && miniAccuracy >= 80) { rank = 'S'; nextRank = null; nextRequirement = '最上位ランク到達済み'; }
  else if (totalSessions >= 8 && mockAccuracy >= 70 && miniAccuracy >= 75) { rank = 'J1'; nextRank = 'S'; nextRequirement = '疑似テスト平均85%以上、ミニテスト平均80%以上'; }
  else if (totalSessions >= 6 && miniAccuracy >= 70) { rank = 'J2'; nextRank = 'J1'; nextRequirement = '疑似テスト平均70%以上を記録する'; }
  else if (totalSessions >= 4 && miniAccuracy >= 60) { rank = 'J3'; nextRank = 'J2'; nextRequirement = 'トレーニング累計6回、ミニテスト平均70%以上'; }
  else if (totalSessions >= 2 || trainingAccuracy >= 55) { rank = 'J4'; nextRank = 'J3'; nextRequirement = 'トレーニング累計4回、ミニテスト平均60%以上'; }
  const descriptions: Record<RankKey, string> = {
    J5: '覚醒前。まずは5分反復を習慣化する段階。',
    J4: '基礎巡航。頻出語を取りこぼさない土台作り。',
    J3: '標準定着。準一級らしい語彙判断が安定し始めた状態。',
    J2: '準1級接近。本番形式の負荷に耐え始めている。',
    J1: '合格射程圏。模試で戦えるラインへ接近。',
    S: '本番投入可。疑似テストでも高水準を維持。'
  };
  return { current: rank, label: descriptions[rank], nextRank, nextRequirement, trainingAccuracy, miniTestAccuracy: miniAccuracy, mockTestAccuracy: mockAccuracy, streak };
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

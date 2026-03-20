import { createInitialProgress, isDue } from './spacedRepetition';
import type { AppProgress, Difficulty, Question } from './types';

const adjacentDifficultyMap: Record<Difficulty, Difficulty[]> = {
  basic: ['basic', 'standard'],
  standard: ['standard', 'basic', 'practical'],
  practical: ['practical', 'standard']
};

function seededShuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let currentSeed = seed;
  for (let i = result.length - 1; i > 0; i -= 1) {
    currentSeed = (currentSeed * 9301 + 49297) % 233280;
    const j = Math.floor((currentSeed / 233280) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function scoreQuestion(question: Question, progress: AppProgress, now: Date, prioritizedIds: Set<string> = new Set()): number {
  const entry = progress.entries[question.id] ?? createInitialProgress(question.id, now);
  const attempts = entry.correctCount + entry.wrongCount;
  const dueBoost = isDue(entry, now) ? 500 : 0;
  const unseenBoost = attempts === 0 ? 150 : 0;
  const weaknessBoost = entry.wrongCount * 40 - entry.correctCount * 10;
  const prioritizedBoost = prioritizedIds.has(question.id) ? 220 : 0;
  return dueBoost + unseenBoost + weaknessBoost + prioritizedBoost;
}

function buildWeightedCandidates(params: {
  questions: Question[];
  difficulty: Difficulty;
  progress: AppProgress;
  now: Date;
  prioritizedIds?: Set<string>;
}): Question[] {
  return params.questions
    .filter((question) => adjacentDifficultyMap[params.difficulty].includes(question.difficulty))
    .map((question, index) => ({ question, score: scoreQuestion(question, params.progress, params.now, params.prioritizedIds) + index }))
    .sort((a, b) => b.score - a.score)
    .map((row) => row.question);
}

export function getQuestionsBySection(questions: Question[], section: Question['section']): Question[] {
  return questions.filter((question) => question.section === section);
}

export function selectPracticeRoundQuestions(params: {
  questions: Question[];
  difficulty: Difficulty;
  progress: AppProgress;
  count: number;
  excludeIds?: Set<string>;
  now?: Date;
  seed?: number;
  prioritizedIds?: Set<string>;
}): Question[] {
  const now = params.now ?? new Date();
  const seed = params.seed ?? now.getTime();
  const excludeIds = params.excludeIds ?? new Set<string>();
  const weighted = buildWeightedCandidates({
    questions: params.questions,
    difficulty: params.difficulty,
    progress: params.progress,
    now,
    prioritizedIds: params.prioritizedIds
  });
  const preferred = weighted.filter((question) => !excludeIds.has(question.id));
  const fallback = weighted.filter((question) => excludeIds.has(question.id));
  const pool = preferred.length >= params.count ? preferred : [...preferred, ...fallback];
  return seededShuffle(pool, seed).slice(0, params.count);
}

export function selectTrainingQuestions(params: {
  questions: Question[];
  difficulty: Difficulty;
  progress: AppProgress;
  practiceCount: number;
  miniTestCount: number;
  now?: Date;
  seed?: number;
  prioritizedIds?: Set<string>;
}): { practiceQuestions: Question[]; miniTestQuestions: Question[] } {
  const now = params.now ?? new Date();
  const seed = params.seed ?? now.getTime();
  const practiceQuestions = selectPracticeRoundQuestions({
    questions: params.questions,
    difficulty: params.difficulty,
    progress: params.progress,
    count: params.practiceCount,
    now,
    seed,
    prioritizedIds: params.prioritizedIds
  });
  const miniTestQuestions = selectPracticeRoundQuestions({
    questions: params.questions,
    difficulty: params.difficulty,
    progress: params.progress,
    count: params.miniTestCount,
    excludeIds: new Set(practiceQuestions.map((question) => question.id)),
    now,
    seed: seed + 99,
    prioritizedIds: params.prioritizedIds
  });
  return { practiceQuestions, miniTestQuestions };
}

export function selectMockTestQuestions(params: { questions: Question[]; section: Question['section']; count: number; progress: AppProgress; now?: Date; seed?: number; }): Question[] {
  const now = params.now ?? new Date();
  const seed = params.seed ?? now.getTime();
  const weighted = getQuestionsBySection(params.questions, params.section)
    .map((question, index) => ({ question, score: scoreQuestion(question, params.progress, now) + index }))
    .sort((a, b) => b.score - a.score)
    .map((row) => row.question);
  return seededShuffle(weighted, seed).slice(0, params.count);
}

export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

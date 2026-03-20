export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface VocabularyItem {
  id: string;
  word: string;
  meaningJa: string;
  distractorsJa: string[];
}

export interface ProgressEntry {
  itemId: string;
  interval: number;
  easeFactor: number;
  dueAt: string;
  lastReviewedAt: string;
  correctCount: number;
  wrongCount: number;
}

export interface AppProgress {
  entries: Record<string, ProgressEntry>;
  totalAnswered: number;
  totalCorrect: number;
}

export interface QuizQuestion {
  item: VocabularyItem;
  choices: string[];
}

export type QuestionSection = 'vocab-gap' | 'long-gap' | 'reading' | 'summary' | 'writing' | 'listening';
export type Difficulty = 'basic' | 'standard' | 'practical';
export type QuestionSource = 'original';
export type SkillTag =
  | 'vocabulary'
  | 'idiom'
  | 'grammar'
  | 'inference'
  | 'main-idea'
  | 'detail'
  | 'summary'
  | 'opinion'
  | 'listening-detail';

export interface Question {
  id: string;
  section: QuestionSection;
  difficulty: Difficulty;
  source: QuestionSource;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  translation?: string;
  audioText?: string;
  audioUrl?: string;
  tags: SkillTag[];
  subcategory?: string;
}

export interface QuestionProgressSummary {
  questionId: string;
  attempts: number;
  accuracy: number | null;
  isDue: boolean;
  wrongCount: number;
  correctCount: number;
}

export interface WeakRecommendation {
  questionId: string;
  section: QuestionSection;
  sectionLabel: string;
  word: string;
  meaningText: string;
  translation: string;
  partOfSpeech: string;
  accuracy: number | null;
  attempts: number;
  wrongCount: number;
  isDue: boolean;
}

export type SessionMode = 'training' | 'mini-test' | 'mock-test';

export interface SessionRecord {
  id: string;
  mode: SessionMode;
  section: QuestionSection;
  difficulty?: Difficulty;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  durationSeconds: number;
  completedAt: string;
}

export interface TestRecord {
  id: string;
  type: 'mini-test' | 'mock-test';
  section: QuestionSection;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  durationSeconds: number;
  completedAt: string;
}

export interface LearningState {
  progress: AppProgress;
  sessions: SessionRecord[];
  miniTests: TestRecord[];
  mockTests: TestRecord[];
}

export interface StreakInfo {
  current: number;
  longest: number;
  lastStudiedOn: string | null;
}

export interface RankCheckpoint {
  label: string;
  current: number;
  target: number;
  unit: '%' | '回' | '日';
  done: boolean;
}

export interface SectionRankInfo {
  section: QuestionSection;
  current: 'J5' | 'J4' | 'J3' | 'J2' | 'J1' | 'S';
  label: string;
  attemptedQuestions: number;
  masteryRate: number;
  dueCount: number;
  progressPercent: number;
  nextRequirement: string;
}

export interface RankInfo {
  current: 'J5' | 'J4' | 'J3' | 'J2' | 'J1' | 'S';
  label: string;
  nextRank: 'J4' | 'J3' | 'J2' | 'J1' | 'S' | null;
  nextRequirement: string;
  trainingAccuracy: number;
  miniTestAccuracy: number;
  mockTestAccuracy: number;
  streak: StreakInfo;
  progressPercent: number;
  checklists: RankCheckpoint[];
  sectionRank: SectionRankInfo;
  sectionRanks: SectionRankInfo[];
}

export interface SessionSummary {
  sessionId: string;
  difficulty: Difficulty;
  practiceCorrect: number;
  practiceTotal: number;
  miniCorrect: number;
  miniTotal: number;
  overallAccuracy: number;
  durationSeconds: number;
  completedAt: string;
}

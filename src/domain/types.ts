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

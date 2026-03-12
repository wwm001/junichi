import type { ProgressEntry, ReviewRating } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

const intervalMultiplier: Record<ReviewRating, number> = {
  again: 0,
  hard: 1.2,
  good: 2,
  easy: 3
};

const easeDelta: Record<ReviewRating, number> = {
  again: -0.3,
  hard: -0.15,
  good: 0,
  easy: 0.15
};

export function createInitialProgress(itemId: string, now = new Date()): ProgressEntry {
  return {
    itemId,
    interval: 1,
    easeFactor: 2.5,
    dueAt: now.toISOString(),
    lastReviewedAt: now.toISOString(),
    correctCount: 0,
    wrongCount: 0
  };
}

export function updateProgress(entry: ProgressEntry, rating: ReviewRating, now = new Date()): ProgressEntry {
  const currentEase = Math.max(1.3, entry.easeFactor + easeDelta[rating]);
  const nextInterval =
    rating === 'again'
      ? 1
      : Math.max(1, Math.round(entry.interval * currentEase * intervalMultiplier[rating]));

  return {
    ...entry,
    interval: nextInterval,
    easeFactor: currentEase,
    dueAt: new Date(now.getTime() + nextInterval * DAY_MS).toISOString(),
    lastReviewedAt: now.toISOString(),
    correctCount: rating === 'again' ? entry.correctCount : entry.correctCount + 1,
    wrongCount: rating === 'again' ? entry.wrongCount + 1 : entry.wrongCount
  };
}

export function isDue(entry: ProgressEntry, now = new Date()): boolean {
  return new Date(entry.dueAt).getTime() <= now.getTime();
}

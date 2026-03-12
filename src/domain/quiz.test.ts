import { describe, expect, it } from 'vitest';
import { buildQuestion, computeAccuracy, selectNextItem } from './quiz';
import type { AppProgress, VocabularyItem } from './types';

const items: VocabularyItem[] = [
  { id: 'a', word: 'abandon', meaningJa: '見捨てる', distractorsJa: ['保護する', '作る', '壊す'] },
  { id: 'b', word: 'compile', meaningJa: '編集する', distractorsJa: ['推測する', '借りる', '削除する'] }
];

const baseProgress: AppProgress = {
  entries: {
    a: {
      itemId: 'a',
      interval: 2,
      easeFactor: 2.5,
      dueAt: '2026-01-01T00:00:00.000Z',
      lastReviewedAt: '2025-12-30T00:00:00.000Z',
      correctCount: 1,
      wrongCount: 0
    },
    b: {
      itemId: 'b',
      interval: 2,
      easeFactor: 2.5,
      dueAt: '2026-01-03T00:00:00.000Z',
      lastReviewedAt: '2025-12-31T00:00:00.000Z',
      correctCount: 1,
      wrongCount: 0
    }
  },
  totalAnswered: 10,
  totalCorrect: 7
};

describe('quiz helpers', () => {
  it('creates four choices containing the answer', () => {
    const question = buildQuestion(items[0], 100);
    expect(question.choices).toHaveLength(4);
    expect(question.choices).toContain(items[0].meaningJa);
  });

  it('selects due item first', () => {
    const selected = selectNextItem(items, baseProgress, new Date('2026-01-02T00:00:00.000Z'));
    expect(selected.id).toBe('a');
  });

  it('computes accuracy', () => {
    expect(computeAccuracy(baseProgress)).toBe(70);
  });
});

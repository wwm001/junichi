import { describe, expect, it } from 'vitest';
import { createInitialProgress, isDue, updateProgress } from './spacedRepetition';

describe('spaced repetition', () => {
  it('resets interval on again', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const entry = createInitialProgress('v1', now);
    const updated = updateProgress({ ...entry, interval: 5 }, 'again', now);

    expect(updated.interval).toBe(1);
    expect(updated.wrongCount).toBe(1);
  });

  it('extends due date on good', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const entry = createInitialProgress('v1', now);
    const updated = updateProgress(entry, 'good', now);

    expect(updated.interval).toBeGreaterThanOrEqual(2);
    expect(new Date(updated.dueAt).getTime()).toBeGreaterThan(now.getTime());
    expect(updated.correctCount).toBe(1);
  });

  it('detects due cards', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const entry = createInitialProgress('v1', new Date('2025-12-20T00:00:00.000Z'));
    expect(isDue(entry, now)).toBe(true);
  });
});

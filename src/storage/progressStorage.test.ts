import { beforeEach, describe, expect, it } from 'vitest';
import { createBrowserProgressStorage, emptyProgress } from './progressStorage';

class MemoryStorage {
  private map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

describe('progressStorage', () => {
  beforeEach(() => {
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true
    });
  });

  it('loads empty progress when no data exists', () => {
    const storage = createBrowserProgressStorage();
    expect(storage.load()).toEqual(emptyProgress);
  });

  it('saves and loads progress', () => {
    const storage = createBrowserProgressStorage();
    const progress = {
      entries: {
        v1: {
          itemId: 'v1',
          interval: 2,
          easeFactor: 2.5,
          dueAt: '2026-01-03T00:00:00.000Z',
          lastReviewedAt: '2026-01-01T00:00:00.000Z',
          correctCount: 1,
          wrongCount: 0
        }
      },
      totalAnswered: 1,
      totalCorrect: 1
    };

    storage.save(progress);
    expect(storage.load()).toEqual(progress);
  });
});

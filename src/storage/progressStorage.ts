import type { AppProgress } from '../domain/types';

const STORAGE_KEY = 'junichi-progress-v1';

export const emptyProgress: AppProgress = {
  entries: {},
  totalAnswered: 0,
  totalCorrect: 0
};

export interface ProgressStorage {
  load: () => AppProgress;
  save: (progress: AppProgress) => void;
  clear: () => void;
}

export function createBrowserProgressStorage(): ProgressStorage {
  return {
    load: () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyProgress;

      try {
        const parsed = JSON.parse(raw) as AppProgress;
        return {
          entries: parsed.entries ?? {},
          totalAnswered: parsed.totalAnswered ?? 0,
          totalCorrect: parsed.totalCorrect ?? 0
        };
      } catch {
        return emptyProgress;
      }
    },
    save: (progress) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    },
    clear: () => {
      localStorage.removeItem(STORAGE_KEY);
    }
  };
}

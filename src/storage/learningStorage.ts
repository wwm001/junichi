import type { LearningState } from '../domain/types';
import { emptyProgress } from './progressStorage';

const STORAGE_KEY = 'junichi-learning-v1_1';
const LEGACY_PROGRESS_KEY = 'junichi-progress-v1';

export const emptyLearningState: LearningState = {
  progress: emptyProgress,
  sessions: [],
  miniTests: [],
  mockTests: []
};

export interface LearningStorage {
  load: () => LearningState;
  save: (state: LearningState) => void;
  clear: () => void;
}

function normalizeState(value: Partial<LearningState> | null | undefined): LearningState {
  return {
    progress: value?.progress ?? emptyProgress,
    sessions: value?.sessions ?? [],
    miniTests: value?.miniTests ?? [],
    mockTests: value?.mockTests ?? []
  };
}

function loadLegacyProgress(): LearningState | null {
  const raw = localStorage.getItem(LEGACY_PROGRESS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return normalizeState({ progress: parsed });
  } catch {
    return null;
  }
}

export function createBrowserLearningStorage(): LearningStorage {
  return {
    load: () => {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        try {
          return normalizeState(JSON.parse(raw) as LearningState);
        } catch {
          return emptyLearningState;
        }
      }
      return loadLegacyProgress() ?? emptyLearningState;
    },
    save: (state) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    },
    clear: () => {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_PROGRESS_KEY);
    }
  };
}

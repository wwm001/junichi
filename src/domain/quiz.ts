import type { AppProgress, QuizQuestion, VocabularyItem } from './types';
import { createInitialProgress, isDue } from './spacedRepetition';

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

export function buildQuestion(item: VocabularyItem, seed = Date.now()): QuizQuestion {
  const options = [item.meaningJa, ...item.distractorsJa].slice(0, 4);
  return { item, choices: seededShuffle(options, seed) };
}

export function selectNextItem(items: VocabularyItem[], progress: AppProgress, now = new Date()): VocabularyItem {
  const scored = items.map((item) => {
    const entry = progress.entries[item.id] ?? createInitialProgress(item.id, now);
    const due = isDue(entry, now);
    return { item, due, dueAt: new Date(entry.dueAt).getTime() };
  });

  const dueItems = scored.filter((row) => row.due);
  if (dueItems.length > 0) {
    dueItems.sort((a, b) => a.dueAt - b.dueAt);
    return dueItems[0].item;
  }

  scored.sort((a, b) => a.dueAt - b.dueAt);
  return scored[0].item;
}

export function computeAccuracy(progress: AppProgress): number {
  if (progress.totalAnswered === 0) {
    return 0;
  }
  return Math.round((progress.totalCorrect / progress.totalAnswered) * 100);
}

import type { TrendItem } from './trends';

/**
 * The free tier grants 20 generate_content requests a day *per model*, so two
 * models are two budgets. Both entries must support Google Search grounding on
 * the free tier: the 3.x models return 429 for a grounded request no matter how
 * much per-model budget is left, so they are not usable here yet.
 */
export const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'] as const;

export interface Rotation {
  /** The next model with budget left, or null once every model is spent. */
  pick(): string | null;
  /** Marks a model out of budget for the rest of this run. */
  retire(model: string): void;
  readonly spent: boolean;
}

/**
 * Hands out models round-robin. The starting point is random so that a run does
 * not always spend its first request on the same model -- over a day that keeps
 * the two budgets roughly level without any state on disk.
 */
export function createRotation(models: readonly string[] = MODELS): Rotation {
  const retired = new Set<string>();
  let cursor = Math.floor(Math.random() * models.length);

  return {
    pick() {
      for (let i = 0; i < models.length; i++) {
        const model = models[(cursor + i) % models.length];
        if (!retired.has(model)) {
          cursor = (cursor + i + 1) % models.length;
          return model;
        }
      }
      return null;
    },
    retire(model) {
      retired.add(model);
    },
    get spent() {
      return retired.size >= models.length;
    },
  };
}

export type ArticleGenerator = (trend: TrendItem, model: string) => Promise<unknown>;

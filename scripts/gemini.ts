import { GoogleGenAI } from '@google/genai';
import type { TrendItem } from './trends';
import { buildGroundedPrompt, parseDraft, type ArticleDraft } from './draft';
import { withRetry } from './retry';

/**
 * Gemini writes the articles that deserve the extra detail: it searches the web
 * itself, so it finds names and quotes that the linked stories alone do not
 * carry. Its budget is the smaller of the two, at 20 requests a day per model.
 */
export async function draftWithGemini(trend: TrendItem, model: string): Promise<ArticleDraft> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model,
        contents: buildGroundedPrompt(trend),
        config: { tools: [{ googleSearch: {} }] },
      }),
    {
      onRetry: (err, attempt, delayMs) =>
        console.warn(
          `Gemini call failed (attempt ${attempt}), retrying in ${delayMs}ms:`,
          err instanceof Error ? err.message.split('\n')[0] : err
        ),
    }
  );

  const finishReason = response.candidates?.[0]?.finishReason ?? 'unknown';
  return parseDraft(response.text ?? '', `Gemini response (${model}, finishReason=${finishReason})`);
}

import type { TrendItem } from './trends';
import { buildSourcedPrompt, parseDraft, type ArticleDraft } from './draft';
import { fetchNewsSources, formatSources } from './sources';
import { withRetry } from './retry';

/**
 * Gemma 4 is the cheapest capable model that stays on the Workers free plan.
 * Measured at roughly 135 neurons an article against a 10,000/day allocation,
 * which is about 74 articles a day.
 */
export const WORKERS_AI_MODEL = '@cf/google/gemma-4-26b-a4b-it';

/** It is a reasoning model, and the thinking counts towards the output budget. */
const MAX_TOKENS = 8000;
const TIMEOUT_MS = 180_000;

export interface WorkersAiResult {
  text: string;
  finishReason: string;
  inputTokens: number;
  outputTokens: number;
}

/** Neuron rates for Gemma 4, from the Workers AI pricing table. */
export function neuronsUsed(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1e6) * 9091 + (outputTokens / 1e6) * 27273;
}

/**
 * True when Workers AI is refusing for reasons that will not change during this
 * run -- the daily neuron allocation, or the free tier being out of GPU.
 */
export function isCapacityError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /capacity|quota|exceeded|rate limit|3040|5035|\b429\b/i.test(message);
}

async function callWorkersAi(prompt: string): Promise<WorkersAiResult> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_WORKERS_AI_READ_TOKEN;
  if (!account || !token) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_WORKERS_AI_READ_TOKEN が未設定です');
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${WORKERS_AI_MODEL}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: MAX_TOKENS }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );

  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const detail = json?.errors ? JSON.stringify(json.errors) : `HTTP ${res.status}`;
    throw new Error(`Workers AI request failed: ${detail}`);
  }

  const choice = json.result.choices?.[0];
  return {
    // Older-shaped responses put the text at result.response instead.
    text: choice?.message?.content ?? json.result.response ?? '',
    finishReason: choice?.finish_reason ?? 'unknown',
    inputTokens: json.result.usage?.prompt_tokens ?? 0,
    outputTokens: json.result.usage?.completion_tokens ?? 0,
  };
}

export async function draftWithWorkersAI(trend: TrendItem): Promise<ArticleDraft> {
  const sources = await fetchNewsSources(trend.newsItems);
  console.log(
    `  sources: ${sources.length}/${trend.newsItems.length} fetched` +
      (sources.length ? ` (${sources.reduce((n, s) => n + s.text.length, 0)} chars)` : '')
  );

  const prompt = buildSourcedPrompt(trend, formatSources(sources));
  const result = await withRetry(() => callWorkersAi(prompt), {
    attempts: 2,
    onRetry: (err, attempt, delayMs) =>
      console.warn(
        `Workers AI call failed (attempt ${attempt}), retrying in ${delayMs}ms:`,
        err instanceof Error ? err.message.split('\n')[0] : err
      ),
  });

  console.log(
    `  ${WORKERS_AI_MODEL}: in=${result.inputTokens} out=${result.outputTokens} ` +
      `≈${neuronsUsed(result.inputTokens, result.outputTokens).toFixed(0)} neurons`
  );

  return parseDraft(
    result.text,
    `Workers AI response (finishReason=${result.finishReason})`
  );
}

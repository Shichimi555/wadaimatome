/**
 * Statuses worth trying again. 503 is what Gemini returns when the model is
 * overloaded ("This model is currently experiencing high demand"), and it took
 * out whole hourly batches -- every article in a run hits the same weather.
 *
 * 429 is deliberately absent: whether it is worth retrying depends on which
 * quota ran out, which isQuotaExhausted answers.
 */
const RETRYABLE_STATUS = new Set([408, 500, 502, 503, 504]);

function statusOf(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number') return status;
  // The SDK also folds the response body into the message, so a client that
  // dropped the status property is still readable.
  const match = textOf(err).match(/"code"\s*:\s*(\d{3})/);
  return match ? Number(match[1]) : undefined;
}

function textOf(err: unknown): string {
  return err instanceof Error ? err.message : String((err as { message?: unknown })?.message ?? err);
}

/**
 * True when a 429 means the budget is gone for longer than this run lasts.
 *
 * Gemini names the quota it refused on. A per-minute quota clears while we wait,
 * so it is an ordinary transient failure; a per-day one does not clear until
 * midnight Pacific, and an unnamed one has never cleared in practice either.
 * Both make the remaining articles in the batch a waste of requests.
 */
export function isQuotaExhausted(err: unknown): boolean {
  if (statusOf(err) !== 429) return false;
  return !/PerMinute/i.test(textOf(err));
}

export function isRetryable(err: unknown): boolean {
  const status = statusOf(err);
  if (status === undefined) return false;
  if (status === 429) return !isQuotaExhausted(err);
  return RETRYABLE_STATUS.has(status);
}

export interface RetryOptions {
  /** Total tries, including the first. */
  attempts?: number;
  /** Doubles each time: 2s, 4s, 8s. */
  baseDelayMs?: number;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Retries `fn` while the error looks transient. A permanent error -- a bad key,
 * a malformed prompt -- is rethrown at once rather than waited on three times.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 2000,
    onRetry,
    sleep = defaultSleep,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts || !isRetryable(err)) throw err;
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      onRetry?.(err, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

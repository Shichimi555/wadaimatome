/**
 * Statuses worth trying again. 503 is what Gemini returns when the model is
 * overloaded ("This model is currently experiencing high demand"), and it took
 * out whole hourly batches -- every article in a run hits the same weather.
 */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export function isRetryable(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number') return RETRYABLE_STATUS.has(status);
  // The SDK also folds the response body into the message, so a client that
  // dropped the status property is still readable.
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/"code"\s*:\s*(\d{3})/);
  return match ? RETRYABLE_STATUS.has(Number(match[1])) : false;
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

import { describe, it, expect, vi } from 'vitest';
import { isRetryable, isQuotaExhausted, withRetry } from '../retry';

const apiError = (status: number) =>
  Object.assign(
    new Error(`{"error":{"code":${status},"message":"boom","status":"UNAVAILABLE"}}`),
    { status }
  );

describe('isRetryable', () => {
  it('should retry an overloaded model', () => {
    expect(isRetryable(apiError(503))).toBe(true);
    expect(isRetryable(apiError(500))).toBe(true);
  });

  it('should not retry a bad key or a bad request', () => {
    expect(isRetryable(apiError(401))).toBe(false);
    expect(isRetryable(apiError(400))).toBe(false);
  });

  it('should read the status out of the body when the property is missing', () => {
    expect(isRetryable(new Error('{"error":{"code":503,"message":"high demand"}}'))).toBe(true);
    expect(isRetryable(new Error('{"error":{"code":400,"message":"bad prompt"}}'))).toBe(false);
  });

  it('should not retry an ordinary error', () => {
    expect(isRetryable(new Error('No JSON found in Gemini response'))).toBe(false);
    expect(isRetryable('nope')).toBe(false);
  });
});

describe('withRetry', () => {
  it('should return the first success without sleeping', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(withRetry(async () => 'ok', { sleep })).resolves.toBe('ok');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('should back off exponentially and then succeed', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValue('ok');

    await expect(withRetry(fn, { sleep, baseDelayMs: 1000 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it('should give up after the last attempt and rethrow', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue(apiError(503));

    await expect(withRetry(fn, { sleep, attempts: 3 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('should rethrow a permanent error immediately', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue(apiError(400));

    await expect(withRetry(fn, { sleep })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('should report each retry', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn().mockRejectedValueOnce(apiError(503)).mockResolvedValue('ok');
    await withRetry(fn, { sleep: async () => {}, baseDelayMs: 500, onRetry });
    expect(onRetry).toHaveBeenCalledWith(expect.anything(), 1, 500);
  });
});

describe('quota-aware retrying', () => {
  const perDay = {
    status: 429,
    message: JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [
              {
                quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier',
                quotaValue: '20',
              },
            ],
          },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '38s' },
        ],
      },
    }),
  };
  const perMinute = {
    status: 429,
    message: JSON.stringify({
      error: {
        code: 429,
        details: [
          {
            violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }],
          },
        ],
      },
    }),
  };
  const vagueQuota = { status: 429, message: 'You exceeded your current quota.' };
  const overloaded = { status: 503, message: 'high demand' };

  it('does not retry a per-day quota error', () => {
    // Retrying burns three requests out of the day's budget to learn what the
    // first response already said. The 38s retryDelay in the body is a lie for
    // a daily quota -- it will not clear until midnight Pacific.
    expect(isRetryable(perDay)).toBe(false);
  });

  it('retries a per-minute quota error', () => {
    expect(isRetryable(perMinute)).toBe(true);
  });

  it('does not retry a 429 whose quota is unnamed', () => {
    expect(isRetryable(vagueQuota)).toBe(false);
  });

  it('still retries an overloaded model', () => {
    expect(isRetryable(overloaded)).toBe(true);
  });

  it('reports a per-day quota as exhausted for the rest of the run', () => {
    expect(isQuotaExhausted(perDay)).toBe(true);
    expect(isQuotaExhausted(vagueQuota)).toBe(true);
  });

  it('does not call a per-minute quota or an overload exhausted', () => {
    expect(isQuotaExhausted(perMinute)).toBe(false);
    expect(isQuotaExhausted(overloaded)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  buildFailureReport,
  buildPublishNotification,
  channelsFromEnv,
  describeError,
  errorTargets,
  planReport,
  redactSecrets,
  type PublishedArticle,
  type RunOutcome,
} from '../generate';

const article = (over: Partial<PublishedArticle> = {}): PublishedArticle => ({
  title: 'テストタイトル',
  slug: '2026-09-04-テスト',
  description: 'テスト説明文',
  tags: ['タグ1', 'タグ2'],
  ...over,
});

describe('buildPublishNotification', () => {
  it('should carry the live url, an edit link, and a promotion tweet', () => {
    const text = buildPublishNotification([article()]);
    expect(text).toContain('**テストタイトル**');
    expect(text).toContain('https://wadaimatome.com/articles/2026-09-04-%E3%83%86%E3%82%B9%E3%83%88/');
    expect(text).toContain('github.com/Shichimi555/wadaimatome/edit/main/src/content/articles/');
    expect(text).toContain('テスト説明文');
    expect(text).toContain('#タグ1');
    expect(text).toContain('#話題まとめ');
  });

  it('should not say anything about a later publish', () => {
    const text = buildPublishNotification([article()]);
    expect(text).not.toContain('自動公開');
    expect(text).not.toContain('参考ツイート');
  });

  it('should percent-encode the edit link so a bracket cannot cut it short', () => {
    const text = buildPublishNotification([article({ slug: '2026-09-04-速報（続報）' })]);
    expect(text).not.toContain('（');
    expect(text).toContain('%EF%BC%88');
  });

  it('should stay inside the discord embed limit by dropping entries', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      article({ title: 'あ'.repeat(900), description: 'い'.repeat(900), slug: `slug-${i}` })
    );
    const text = buildPublishNotification(many);
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toContain('…ほか');
  });

  it('should keep every entry when they fit', () => {
    const text = buildPublishNotification([article({ slug: 'a' }), article({ slug: 'b' })]);
    expect(text).not.toContain('…ほか');
    expect(text.length).toBeLessThanOrEqual(4096);
  });
});

describe('redactSecrets', () => {
  it('should strip a key out of a quoted request url', () => {
    const out = redactSecrets(
      'GET https://generativelanguage.googleapis.com/v1/models?key=AIzaSyC0ffee123456789abcdef failed'
    );
    expect(out).not.toContain('AIzaSyC0ffee123456789abcdef');
    expect(out).toContain('key=***');
    expect(out).toContain('failed');
  });

  it('should strip a bare api key and a github token', () => {
    expect(redactSecrets('AIzaSyC0ffee123456789abcdef')).toBe('***');
    expect(redactSecrets('ghp_0123456789abcdefghij')).toBe('***');
  });

  it('should strip a discord webhook url', () => {
    expect(redactSecrets('POST https://discord.com/api/webhooks/123/abcdef timed out')).toBe(
      'POST *** timed out'
    );
  });

  it('should leave ordinary error text alone', () => {
    const message = 'fetch failed: ECONNRESET after 3 retries (トレンド取得)';
    expect(redactSecrets(message)).toBe(message);
  });
});

const overloaded = Object.assign(
  new Error(
    '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}\n    at throwErrorIfNotOK (/x/node_modules/@google/genai/src/_api_client.ts:982:24)'
  ),
  { status: 503 }
);

describe('describeError', () => {
  it('should pull the status and message out of a gemini failure', () => {
    const out = describeError(overloaded);
    expect(out).toContain('503');
    expect(out).toContain('UNAVAILABLE');
    expect(out).toContain('high demand');
  });

  it('should drop the stack trace', () => {
    expect(describeError(overloaded)).not.toContain('_api_client.ts');
  });

  it('should fall back to the first line of an ordinary error', () => {
    expect(describeError(new Error('No JSON found in Gemini response\n  at foo'))).toBe(
      'No JSON found in Gemini response'
    );
  });

  it('should redact a key that leaked into the message', () => {
    const out = describeError(new Error('GET https://x/v1?key=AIzaSyC0ffee123456789abcdef failed'));
    expect(out).not.toContain('AIzaSyC0ffee123456789abcdef');
  });
});

describe('buildFailureReport', () => {
  it('should group keywords under a shared error', () => {
    const report = buildFailureReport([
      { trend: '楽天', error: '503 UNAVAILABLE: high demand' },
      { trend: 'fod', error: '503 UNAVAILABLE: high demand' },
      { trend: 'アジア大会', error: 'No JSON found' },
    ]);
    expect(report.match(/high demand/g)).toHaveLength(1);
    expect(report).toContain('対象: 楽天、fod');
    expect(report).toContain('対象: アジア大会');
  });
});

const MAIN = 'https://discord.com/api/webhooks/1/main';
const ERRORS = 'https://discord.com/api/webhooks/2/errors';

const outcome = (over: Partial<RunOutcome> = {}): RunOutcome => ({
  published: [],
  failed: [],
  trends: 10,
  ...over,
});

const failure = { trend: '楽天', error: '429 RESOURCE_EXHAUSTED: quota' };

describe('planReport', () => {
  it('should leave the error channel silent on a clean run', () => {
    const plan = planReport({ main: MAIN, errors: ERRORS }, outcome({ published: [article()] }));
    expect(plan).toHaveLength(1);
    expect(plan[0].webhookUrl).toBe(MAIN);
    expect(plan[0].embeds?.[0].title).toContain('公開しました');
  });

  it('should tell the error channel about a partial failure the main embed buries', () => {
    const plan = planReport(
      { main: MAIN, errors: ERRORS },
      outcome({ published: [article()], failed: [failure] })
    );
    expect(plan.map((d) => d.webhookUrl)).toEqual([MAIN, ERRORS]);
    expect(plan[1].embeds?.[0].title).toBe('⚠️ 1件の生成に失敗（1件は公開）');
    expect(plan[1].embeds?.[0].description).toContain('RESOURCE_EXHAUSTED');
  });

  it('should report a total failure on both channels', () => {
    const plan = planReport({ main: MAIN, errors: ERRORS }, outcome({ failed: [failure] }));
    expect(plan).toHaveLength(2);
    for (const delivery of plan) {
      expect(delivery.embeds?.[0].title).toContain('1件も公開できませんでした');
    }
  });

  it('should treat an empty trend feed as an error worth escalating', () => {
    const plan = planReport({ main: MAIN, errors: ERRORS }, outcome({ trends: 0 }));
    expect(plan).toHaveLength(2);
    expect(plan[1].content).toContain('トレンドを1件も取得できませんでした');
  });

  it('should say nothing to the error channel when there is simply nothing new', () => {
    const plan = planReport({ main: MAIN, errors: ERRORS }, outcome());
    expect(plan).toHaveLength(1);
    expect(plan[0].content).toContain('新規トレンドなし');
  });

  it('should not send twice when both variables name the same channel', () => {
    const plan = planReport({ main: MAIN, errors: MAIN }, outcome({ failed: [failure] }));
    expect(plan).toHaveLength(1);
  });

  it('should still report failures when only the error channel is configured', () => {
    const plan = planReport({ errors: ERRORS }, outcome({ failed: [failure] }));
    expect(plan.map((d) => d.webhookUrl)).toEqual([ERRORS]);
  });

  it('should carry the quota note to both channels', () => {
    const plan = planReport(
      { main: MAIN, errors: ERRORS },
      outcome({ failed: [failure], quotaExhausted: true })
    );
    for (const delivery of plan) {
      expect(delivery.embeds?.[0].description).toContain('1日の上限');
    }
  });

  it('should stay inside the discord embed limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ trend: `t${i}`, error: 'あ'.repeat(300) }));
    const plan = planReport({ main: MAIN, errors: ERRORS }, outcome({ failed: many }));
    for (const delivery of plan) {
      expect(delivery.embeds?.[0].description.length).toBeLessThanOrEqual(4096);
    }
  });
});

describe('errorTargets', () => {
  it('should reach both channels once each', () => {
    expect(errorTargets({ main: MAIN, errors: ERRORS })).toEqual([MAIN, ERRORS]);
  });

  it('should collapse a duplicate and drop what is unset', () => {
    expect(errorTargets({ main: MAIN, errors: MAIN })).toEqual([MAIN]);
    expect(errorTargets({ errors: ERRORS })).toEqual([ERRORS]);
    expect(errorTargets({})).toEqual([]);
  });
});

describe('channelsFromEnv', () => {
  it('should read both webhooks', () => {
    expect(
      channelsFromEnv({ DISCORD_WEBHOOK_URL: MAIN, DISCORD_ERROR_WEBHOOK_URL: ERRORS })
    ).toEqual({ main: MAIN, errors: ERRORS });
  });
});

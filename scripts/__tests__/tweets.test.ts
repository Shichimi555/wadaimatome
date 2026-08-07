import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchTweets, formatTweetsMarkdown, type Tweet } from '../tweets';

function buildNextDataHtml(entries: any[]): string {
  const data = {
    props: {
      pageProps: {
        pageData: {
          timeline: {
            head: {
              totalResultsAvailable: entries.length,
              totalResultsReturned: entries.length,
            },
            entry: entries,
          },
        },
      },
    },
  };
  return `<html><head></head><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

function makeTweetEntry(overrides: Record<string, any> = {}) {
  return {
    id: '123456',
    displayTextBody: 'テストツイート',
    name: 'テストユーザー',
    screenName: 'testuser',
    createdAt: 1700000000,
    rtCount: 5,
    likesCount: 10,
    inReplyTo: '',
    ...overrides,
  };
}

describe('fetchTweets', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should parse tweets from Yahoo Realtime Search response', async () => {
    const entries = [
      makeTweetEntry({ id: '1', displayTextBody: '最初のツイート', rtCount: 3, likesCount: 7 }),
      makeTweetEntry({ id: '2', displayTextBody: '人気ツイート', rtCount: 10, likesCount: 20 }),
    ];
    const html = buildNextDataHtml(entries);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(html, { status: 200 }));

    const result = await fetchTweets('テスト');

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('2');
    expect(result[1].id).toBe('1');
  });

  it('should filter out replies', async () => {
    const entries = [
      makeTweetEntry({ id: '1', inReplyTo: '' }),
      makeTweetEntry({ id: '2', inReplyTo: '999' }),
    ];
    const html = buildNextDataHtml(entries);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(html, { status: 200 }));

    const result = await fetchTweets('テスト');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('should clean display text markers', async () => {
    const entries = [
      makeTweetEntry({
        displayTextBody: '【速報】\tSTART\tキーワード\tEND\tに関するニュース https://t.co/abc123',
      }),
    ];
    const html = buildNextDataHtml(entries);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(html, { status: 200 }));

    const result = await fetchTweets('テスト');

    expect(result[0].text).toBe('【速報】キーワードに関するニュース');
  });

  it('should respect limit parameter', async () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeTweetEntry({ id: String(i), rtCount: i })
    );
    const html = buildNextDataHtml(entries);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(html, { status: 200 }));

    const result = await fetchTweets('テスト', 3);

    expect(result).toHaveLength(3);
  });

  it('should return empty array on fetch error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));

    const result = await fetchTweets('テスト');

    expect(result).toEqual([]);
  });

  it('should return empty array on non-200 response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('error', { status: 403 }));

    const result = await fetchTweets('テスト');

    expect(result).toEqual([]);
  });

  it('should return empty array when no __NEXT_DATA__ found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html><body></body></html>', { status: 200 })
    );

    const result = await fetchTweets('テスト');

    expect(result).toEqual([]);
  });
});

describe('formatTweetsMarkdown', () => {
  it('should format tweets as blockquotes', () => {
    const tweets: Tweet[] = [
      {
        id: '1',
        text: 'テストツイート',
        name: 'テストユーザー',
        screenName: 'testuser',
        url: 'https://x.com/testuser/status/1',
        createdAt: 1700000000,
        rtCount: 5,
        likesCount: 10,
      },
    ];

    const result = formatTweetsMarkdown(tweets);

    expect(result).toContain('## ネットの反応');
    expect(result).toContain('> テストツイート');
    expect(result).toContain('@testuser');
  });

  it('should return empty string when no tweets', () => {
    expect(formatTweetsMarkdown([])).toBe('');
  });
});

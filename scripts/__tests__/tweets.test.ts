import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchTweets,
  formatTweetsHtml,
  buildQueryCandidates,
  parseMedia,
  snowflakeToUnix,
  type Tweet,
} from '../tweets';

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

describe('buildQueryCandidates', () => {
  it('should fall back to the head noun of an unspaced compound keyword', () => {
    const candidates = buildQueryCandidates('ラグビー選手熱中症死亡');

    expect(candidates[0]).toBe('ラグビー選手熱中症死亡');
    expect(candidates).toContain('ラグビー');
  });

  it('should fall back to the first token of a spaced keyword', () => {
    expect(buildQueryCandidates('東京エレクトロン 株価')).toEqual([
      '東京エレクトロン 株価',
      '東京エレクトロン',
    ]);
  });

  it('should not produce fallbacks for a short simple keyword', () => {
    expect(buildQueryCandidates('大谷翔平')).toEqual(['大谷翔平']);
  });

  it('should cap the number of candidates', () => {
    expect(buildQueryCandidates('ラグビー選手熱中症死亡').length).toBeLessThanOrEqual(3);
  });
});

describe('parseMedia', () => {
  it('should map image media to its proxied URL and size', () => {
    const media = parseMedia({
      media: [
        {
          type: 'image',
          item: {
            mediaUrl: 'https://rts-pctr.c.yimg.jp/abc',
            sizes: { viewer: { width: 900, height: 1200 } },
          },
        },
      ],
    });

    expect(media).toEqual([
      { type: 'image', url: 'https://rts-pctr.c.yimg.jp/abc', width: 900, height: 1200 },
    ]);
  });

  it('should use the poster frame for videos, not the HLS stream', () => {
    const media = parseMedia({
      media: [
        {
          type: 'video',
          item: {
            mediaUrl: 'https://video.twimg.com/amplify_video/1/pl/x.m3u8',
            thumbnailImageUrl: 'https://rts-pctr.c.yimg.jp/thumb',
            sizes: { viewer: { width: 1200, height: 675 } },
          },
        },
      ],
    });

    expect(media[0].type).toBe('video');
    expect(media[0].url).toBe('https://rts-pctr.c.yimg.jp/thumb');
  });

  it('should use the thumbnail for youTube cards, never the watch URL', () => {
    const media = parseMedia({
      media: [
        {
          type: 'youTube',
          item: {
            mediaUrl: 'https://youtu.be/4veaaopZ7Ec?si=beZhz',
            thumbnailImageUrl: 'https://img.youtube.com/vi/4veaaopZ7Ec/0.jpg',
            sizes: { viewer: { width: 480, height: 360 } },
          },
        },
      ],
    });

    expect(media).toEqual([
      { type: 'video', url: 'https://img.youtube.com/vi/4veaaopZ7Ec/0.jpg', width: 480, height: 360 },
    ]);
  });

  it('should drop media of an unknown type', () => {
    expect(
      parseMedia({ media: [{ type: 'card', item: { mediaUrl: 'https://example.com/page' } }] })
    ).toEqual([]);
  });

  it('should drop media without a usable https URL and cap at 4', () => {
    const entry = {
      media: [
        { type: 'image', item: {} },
        { type: 'image', item: { mediaUrl: 'javascript:alert(1)' } },
        ...Array.from({ length: 6 }, (_, i) => ({
          type: 'image',
          item: { mediaUrl: `https://rts-pctr.c.yimg.jp/${i}` },
        })),
      ],
    };

    expect(parseMedia(entry)).toHaveLength(4);
  });

  it('should return an empty array when there is no media', () => {
    expect(parseMedia({})).toEqual([]);
  });
});

describe('formatTweetsHtml', () => {
  function makeTweet(overrides: Partial<Tweet> = {}): Tweet {
    return {
      id: '1',
      text: 'テストツイート',
      name: 'テストユーザー',
      screenName: 'testuser',
      avatar: 'https://rts-pctr.c.yimg.jp/avatar',
      url: 'https://x.com/testuser/status/1',
      createdAt: 1700000000,
      rtCount: 5,
      likesCount: 10,
      media: [],
      ...overrides,
    };
  }

  it('should render the avatar and media images', () => {
    const result = formatTweetsHtml([
      makeTweet({
        media: [
          { type: 'image', url: 'https://rts-pctr.c.yimg.jp/a', width: 900, height: 1200 },
          { type: 'video', url: 'https://rts-pctr.c.yimg.jp/b', width: 1200, height: 675 },
        ],
      }),
    ]);

    expect(result).toContain('tweet-embed__avatar');
    expect(result).toContain('src="https://rts-pctr.c.yimg.jp/avatar"');
    expect(result).toContain('data-count="2"');
    expect(result).toContain('src="https://rts-pctr.c.yimg.jp/a"');
    expect(result).toContain('width="900" height="1200"');
    expect(result).toContain('tweet-embed__media-item--video');
    expect(result).toContain('tweet-embed__play');
    expect(result).toContain('loading="lazy"');
  });

  it('should omit the media block when a tweet has no media', () => {
    expect(formatTweetsHtml([makeTweet()])).not.toContain('tweet-embed__media');
  });

  it('should render tweets as embed cards', () => {
    const result = formatTweetsHtml([makeTweet()]);

    expect(result).toContain('## ネットの反応');
    expect(result).toContain('<div class="tweet-embeds">');
    expect(result).toContain('href="https://x.com/testuser/status/1"');
    expect(result).toContain('>テストツイート<');
    expect(result).toContain('@testuser');
    expect(result).toContain('♡ 10');
    expect(result).toContain('⇄ 5');
    expect(result).not.toContain('> テストツイート');
  });

  it('should keep each card on a single line so Markdown does not reparse it', () => {
    const result = formatTweetsHtml([makeTweet({ id: '1' }), makeTweet({ id: '2' })]);
    const cardLines = result.split('\n').filter((l) => l.startsWith('<a class="tweet-embed"'));

    expect(cardLines).toHaveLength(2);
    expect(cardLines.every((l) => l.endsWith('</a>'))).toBe(true);
  });

  it('should escape HTML in tweet text and author fields', () => {
    const result = formatTweetsHtml([
      makeTweet({ text: '<script>alert("x")</script>', name: 'A & B "quoted"' }),
    ]);

    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('A &amp; B &quot;quoted&quot;');
  });

  it('should return empty string when no tweets', () => {
    expect(formatTweetsHtml([])).toBe('');
  });
});

describe('snowflakeToUnix', () => {
  it('should decode the creation time from an X snowflake ID', () => {
    // 2085905252323406314 was posted 2026-08-08 10:45 JST
    const seconds = snowflakeToUnix('2085905252323406314');
    const jst = new Date(seconds * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    expect(jst).toContain('2026/8/8');
    expect(jst).toContain('10:45');
  });

  it('should return 0 for a non-numeric id', () => {
    expect(snowflakeToUnix('not-an-id')).toBe(0);
  });
});

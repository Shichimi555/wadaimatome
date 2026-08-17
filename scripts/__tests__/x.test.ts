import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  TWEET_LIMIT,
  buildAuthHeader,
  buildTweet,
  postTweet,
  readCredentials,
  rfc3986,
  signatureBaseString,
  toHashtag,
  truncateToWeight,
  weightedLength,
  type XCredentials,
} from '../x';

const CREDS: XCredentials = {
  apiKey: 'consumer-key',
  apiSecret: 'consumer-secret',
  accessToken: 'access-token',
  accessSecret: 'access-secret',
};

describe('rfc3986', () => {
  it('should escape the characters encodeURIComponent leaves alone', () => {
    expect(rfc3986("!*'()")).toBe('%21%2A%27%28%29');
  });

  it('should leave unreserved characters untouched', () => {
    expect(rfc3986('aZ0-._~')).toBe('aZ0-._~');
  });
});

describe('signatureBaseString', () => {
  it('should sort parameters and percent-encode the joined string', () => {
    const base = signatureBaseString('post', 'https://api.x.com/2/tweets', {
      b: '2',
      a: '1',
    });

    expect(base).toBe('POST&https%3A%2F%2Fapi.x.com%2F2%2Ftweets&a%3D1%26b%3D2');
  });
});

describe('OAuth 1.0a signing', () => {
  it('should reproduce the reference signature from the X developer docs', () => {
    // https://developer.x.com/en/docs/authentication/oauth-1-0a/creating-a-signature
    const params = {
      status: 'Hello Ladies + Gentlemen, a signed OAuth request!',
      include_entities: 'true',
      oauth_consumer_key: 'xvz1evFS4wEEPTGEFPHBog',
      oauth_nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: '1318622958',
      oauth_token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
      oauth_version: '1.0',
    };
    const base = signatureBaseString(
      'POST',
      'https://api.twitter.com/1.1/statuses/update.json',
      params
    );
    const key = `${rfc3986('kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw')}&${rfc3986(
      'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE'
    )}`;

    expect(createHmac('sha1', key).update(base).digest('base64')).toBe(
      'hCtSmYh+iHYCEqBWrE7C7hYmtUk='
    );
  });
});

describe('buildAuthHeader', () => {
  it('should produce a stable signature for fixed nonce and timestamp', () => {
    const header = buildAuthHeader('POST', 'https://api.x.com/2/tweets', CREDS, {
      nonce: 'abc123',
      timestamp: '1700000000',
    });
    const again = buildAuthHeader('POST', 'https://api.x.com/2/tweets', CREDS, {
      nonce: 'abc123',
      timestamp: '1700000000',
    });

    expect(header).toBe(again);
    expect(header).toMatch(/^OAuth /);
    expect(header).toContain('oauth_consumer_key="consumer-key"');
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
    expect(header).toContain('oauth_token="access-token"');
    expect(header).toContain('oauth_version="1.0"');
    expect(header).toMatch(/oauth_signature="[^"]+"/);
  });

  it('should change the signature when the secret changes', () => {
    const opts = { nonce: 'abc123', timestamp: '1700000000' };
    const a = buildAuthHeader('POST', 'https://api.x.com/2/tweets', CREDS, opts);
    const b = buildAuthHeader(
      'POST',
      'https://api.x.com/2/tweets',
      { ...CREDS, accessSecret: 'other' },
      opts
    );

    expect(a).not.toBe(b);
  });

  it('should never leak the secrets into the header', () => {
    const header = buildAuthHeader('POST', 'https://api.x.com/2/tweets', CREDS);

    expect(header).not.toContain('consumer-secret');
    expect(header).not.toContain('access-secret');
  });
});

describe('weightedLength', () => {
  it('should count Latin characters as 1', () => {
    expect(weightedLength('hello')).toBe(5);
  });

  it('should count Japanese characters as 2', () => {
    expect(weightedLength('話題')).toBe(4);
  });

  it('should count any URL as 23', () => {
    expect(weightedLength('https://wadaimatome.com/articles/a-very-long-slug-here/')).toBe(23);
  });

  it('should combine text and URLs', () => {
    expect(weightedLength('話題 https://wadaimatome.com/')).toBe(4 + 1 + 23);
  });
});

describe('truncateToWeight', () => {
  it('should leave text that already fits', () => {
    expect(truncateToWeight('短い', 10)).toBe('短い');
  });

  it('should cut to the budget and mark the cut', () => {
    const result = truncateToWeight('あいうえおかきくけこ', 10);

    expect(result.endsWith('…')).toBe(true);
    expect(weightedLength(result)).toBeLessThanOrEqual(10);
  });
});

describe('toHashtag', () => {
  it('should strip characters that would end the hashtag early', () => {
    expect(toHashtag('東京 都')).toBe('東京都');
    expect(toHashtag('株価・速報')).toBe('株価速報');
  });
});

describe('buildTweet', () => {
  const base = {
    title: 'タイトル',
    description: '本文の要約です',
    url: 'https://wadaimatome.com/articles/test/',
    tags: ['台風', '気象'],
  };

  it('should put the description, URL and hashtags together', () => {
    const tweet = buildTweet(base);

    expect(tweet).toContain('本文の要約です');
    expect(tweet).toContain('https://wadaimatome.com/articles/test/');
    expect(tweet).toContain('#台風 #気象 #話題まとめ');
  });

  it('should stay inside the weighted limit for a long description', () => {
    const tweet = buildTweet({ ...base, description: 'あ'.repeat(500) });

    expect(weightedLength(tweet)).toBeLessThanOrEqual(TWEET_LIMIT);
    expect(tweet).toContain('…');
    expect(tweet).toContain('https://wadaimatome.com/articles/test/');
    expect(tweet).toContain('#話題まとめ');
  });

  it('should use at most two article hashtags', () => {
    const tweet = buildTweet({ ...base, tags: ['a', 'b', 'c', 'd'] });

    expect(tweet).toContain('#a #b #話題まとめ');
    expect(tweet).not.toContain('#c');
  });

  it('should fall back to the title when there is no description', () => {
    expect(buildTweet({ ...base, description: '  ' })).toContain('タイトル');
  });
});

describe('readCredentials', () => {
  it('should return null when any variable is missing', () => {
    expect(
      readCredentials({ X_API_KEY: 'a', X_API_SECRET: 'b', X_ACCESS_TOKEN: 'c' } as any)
    ).toBeNull();
  });

  it('should read all four variables', () => {
    expect(
      readCredentials({
        X_API_KEY: 'a',
        X_API_SECRET: 'b',
        X_ACCESS_TOKEN: 'c',
        X_ACCESS_TOKEN_SECRET: 'd',
      } as any)
    ).toEqual({
      apiKey: 'a',
      apiSecret: 'b',
      accessToken: 'c',
      accessSecret: 'd',
    });
  });
});

describe('postTweet', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should POST the text as JSON and return the new tweet id', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { id: '123', text: 'ok' } }), { status: 201 })
      );

    const id = await postTweet('テスト', CREDS);

    expect(id).toBe('123');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.x.com/2/tweets');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ text: 'テスト' });
    expect((init?.headers as Record<string, string>).Authorization).toMatch(/^OAuth /);
  });

  it('should return null on an API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"title":"Too Many Requests"}', { status: 429 })
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await postTweet('テスト', CREDS)).toBeNull();
  });

  it('should return null when the request throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await postTweet('テスト', CREDS)).toBeNull();
  });
});

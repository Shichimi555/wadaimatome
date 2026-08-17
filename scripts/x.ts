import { createHmac, randomBytes } from 'node:crypto';

const API_URL = 'https://api.x.com/2/tweets';

/** X counts a tweet in weighted characters, not code points. */
export const TWEET_LIMIT = 280;

/** Every link is rewritten to t.co, so its length is fixed regardless of the URL. */
const URL_WEIGHT = 23;
const URL_PATTERN = /https?:\/\/\S+/g;

export interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

/** Reads OAuth 1.0a credentials from the environment, or null when unset. */
export function readCredentials(env: NodeJS.ProcessEnv = process.env): XCredentials | null {
  const apiKey = env.X_API_KEY;
  const apiSecret = env.X_API_SECRET;
  const accessToken = env.X_ACCESS_TOKEN;
  const accessSecret = env.X_ACCESS_TOKEN_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return null;
  return { apiKey, apiSecret, accessToken, accessSecret };
}

/**
 * OAuth 1.0a requires RFC 3986 encoding; encodeURIComponent leaves !*'() alone.
 */
export function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

export function signatureBaseString(
  method: string,
  url: string,
  params: Record<string, string>
): string {
  const normalised = Object.keys(params)
    .sort()
    .map((key) => `${rfc3986(key)}=${rfc3986(params[key])}`)
    .join('&');
  return [method.toUpperCase(), rfc3986(url), rfc3986(normalised)].join('&');
}

/**
 * The JSON body is deliberately excluded from the signature: OAuth 1.0a only
 * folds the request body in when it is form-encoded, which /2/tweets is not.
 */
export function buildAuthHeader(
  method: string,
  url: string,
  creds: XCredentials,
  overrides: { nonce?: string; timestamp?: string } = {}
): string {
  const params: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: overrides.nonce ?? randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: overrides.timestamp ?? String(Math.floor(Date.now() / 1000)),
    oauth_token: creds.accessToken,
    oauth_version: '1.0',
  };

  const key = `${rfc3986(creds.apiSecret)}&${rfc3986(creds.accessSecret)}`;
  const signature = createHmac('sha1', key)
    .update(signatureBaseString(method, url, params))
    .digest('base64');

  const signed = { ...params, oauth_signature: signature };
  return (
    'OAuth ' +
    Object.keys(signed)
      .sort()
      .map((k) => `${rfc3986(k)}="${rfc3986(signed[k])}"`)
      .join(', ')
  );
}

/**
 * X weights most CJK and emoji as 2 and Latin as 1, and every URL as 23.
 * https://developer.x.com/en/docs/counting-characters
 */
export function weightedLength(text: string): number {
  const urls = text.match(URL_PATTERN) ?? [];
  let weight = urls.length * URL_WEIGHT;
  for (const char of text.replace(URL_PATTERN, '')) {
    weight += isSingleWeight(char.codePointAt(0) ?? 0) ? 1 : 2;
  }
  return weight;
}

function isSingleWeight(codePoint: number): boolean {
  return (
    codePoint <= 0x10ff ||
    (codePoint >= 0x2000 && codePoint <= 0x200d) ||
    (codePoint >= 0x2010 && codePoint <= 0x201f) ||
    (codePoint >= 0x2032 && codePoint <= 0x2037)
  );
}

/** Trims to a weighted budget, adding an ellipsis when anything was cut. */
export function truncateToWeight(text: string, budget: number): string {
  if (weightedLength(text) <= budget) return text;

  let out = '';
  let weight = 0;
  for (const char of text) {
    const next = weight + (isSingleWeight(char.codePointAt(0) ?? 0) ? 1 : 2);
    if (next > budget - 1) break; // reserve 1 for the ellipsis
    out += char;
    weight = next;
  }
  return out.trimEnd() + '…';
}

/** Hashtags break on spaces and punctuation, so strip everything else out. */
export function toHashtag(tag: string): string {
  return tag.replace(/[^\p{L}\p{N}_]/gu, '');
}

export function buildTweet(opts: {
  title: string;
  description: string;
  url: string;
  tags: string[];
}): string {
  const hashtags = [
    ...opts.tags.map(toHashtag).filter(Boolean).slice(0, 2),
    '話題まとめ',
  ]
    .map((t) => `#${t}`)
    .join(' ');

  const tail = `\n${opts.url}\n${hashtags}`;
  const lead = opts.description.trim() || opts.title.trim();
  return truncateToWeight(lead, TWEET_LIMIT - weightedLength(tail)) + tail;
}

/** Posts a tweet, returning its ID, or null when the call failed. */
export async function postTweet(text: string, creds: XCredentials): Promise<string | null> {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: buildAuthHeader('POST', API_URL, creds),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`X API returned ${res.status}: ${await res.text()}`);
      return null;
    }

    const data: any = await res.json();
    return data?.data?.id ?? null;
  } catch (err) {
    console.error('Failed to post to X:', err);
    return null;
  }
}

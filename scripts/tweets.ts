export interface TweetMedia {
  type: 'image' | 'video';
  /** Still image to show (the poster frame for videos). */
  url: string;
  width: number;
  height: number;
}

export interface Tweet {
  id: string;
  text: string;
  name: string;
  screenName: string;
  avatar: string;
  url: string;
  createdAt: number;
  rtCount: number;
  likesCount: number;
  media: TweetMedia[];
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAX_MEDIA_PER_TWEET = 4;

/**
 * Google Trends hands us compound keywords like "ラグビー選手熱中症死亡" that match
 * nothing on Yahoo Realtime. Fall back to progressively broader queries.
 */
export function buildQueryCandidates(keyword: string): string[] {
  const candidates: string[] = [];
  const push = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length >= 2 && !candidates.includes(trimmed)) candidates.push(trimmed);
  };

  push(keyword);

  const tokens = keyword.split(/[\s　]+/).filter(Boolean);
  if (tokens.length > 1) {
    // "東京エレクトロン 株価" -> "東京エレクトロン"
    push(tokens[0]);
  } else if (keyword.length >= 6) {
    // Split an unspaced compound on script boundaries and try the head noun,
    // then the longest run. "ラグビー選手熱中症死亡" -> "ラグビー", "選手熱中症死亡"
    const runs = (keyword.match(/[ぁ-ゟ]+|[゠-ヿー]+|[一-龯々〆]+|[A-Za-z0-9]+/g) ?? []).filter(
      (run) => run.length >= 2
    );
    if (runs.length > 1) {
      push(runs[0]);
      push([...runs].sort((a, b) => b.length - a.length)[0]);
    }
  }

  return candidates.slice(0, 3);
}

/**
 * Yahoo's `media[].type` is one of image / video / youTube. Only `image` puts a
 * picture in `item.mediaUrl` — for video it is an HLS manifest and for youTube
 * it is the watch page, so those must fall back to the poster frame.
 */
export function parseMedia(entry: any): TweetMedia[] {
  const raw = Array.isArray(entry?.media) ? entry.media : [];

  return raw
    .map((m: any): TweetMedia | null => {
      const item = m?.item ?? {};
      if (m?.type !== 'image' && m?.type !== 'video' && m?.type !== 'youTube') return null;

      const isVideo = m.type !== 'image';
      const url = isVideo
        ? (item.thumbnailImageUrl ?? m.metaImageUrl)
        : (item.mediaUrl ?? m.metaImageUrl ?? item.thumbnailImageUrl);
      if (typeof url !== 'string' || !/^https:\/\//.test(url)) return null;

      const size = item?.sizes?.viewer ?? {};
      return {
        type: isVideo ? 'video' : 'image',
        url,
        width: Number(size.width) || 0,
        height: Number(size.height) || 0,
      };
    })
    .filter((m: TweetMedia | null): m is TweetMedia => m !== null)
    .slice(0, MAX_MEDIA_PER_TWEET);
}

async function searchTweets(query: string, limit: number): Promise<Tweet[]> {
  const url = `https://search.yahoo.co.jp/realtime/search?p=${encodeURIComponent(query)}&rkf=1`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
    },
    signal: AbortSignal.timeout(10000),
    redirect: 'follow',
  });

  if (!res.ok) return [];

  const html = await res.text();
  const match = html.match(
    /__NEXT_DATA__[^>]*type="application\/json">({.*?})<\/script>/
  );
  if (!match) return [];

  const data = JSON.parse(match[1]);
  const entries: any[] = data?.props?.pageProps?.pageData?.timeline?.entry ?? [];

  return entries
    .filter((e) => !e.inReplyTo && !e.possiblySensitive)
    .map(toTweet)
    .filter((t) => t.text.length > 0 || t.media.length > 0)
    .sort((a, b) => b.rtCount + b.likesCount - (a.rtCount + a.likesCount))
    .slice(0, limit);
}

function toTweet(entry: any): Tweet {
  return {
    id: entry.id,
    text: cleanDisplayText(entry.displayTextBody ?? entry.displayText ?? ''),
    name: entry.name,
    screenName: entry.screenName,
    avatar: typeof entry.profileImage === 'string' ? entry.profileImage : '',
    url: `https://x.com/${entry.screenName}/status/${entry.id}`,
    createdAt: entry.createdAt ?? snowflakeToUnix(entry.id),
    rtCount: entry.rtCount ?? 0,
    likesCount: entry.likesCount ?? 0,
    media: parseMedia(entry),
  };
}

/** X snowflake IDs encode their creation time. */
export function snowflakeToUnix(id: string): number {
  try {
    return Number((BigInt(id) >> 22n) + 1288834974657n) / 1000;
  } catch {
    return 0;
  }
}

/** Looks a single tweet up by ID via Yahoo Realtime's detail page. */
export async function fetchTweetById(id: string): Promise<Tweet | null> {
  try {
    const res = await fetch(
      `https://search.yahoo.co.jp/realtime/search/tweet/${encodeURIComponent(id)}?detail=1&ifr=tl_twdtl&rkf=1`,
      {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3' },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!res.ok) return null;

    const match = (await res.text()).match(
      /__NEXT_DATA__[^>]*type="application\/json">({.*?})<\/script>/
    );
    if (!match) return null;

    const best = JSON.parse(match[1])?.props?.pageProps?.pageData?.bestTweet;
    if (!best || best.id !== id || !best.screenName) return null;

    return toTweet(best);
  } catch {
    return null;
  }
}

export async function fetchTweets(keyword: string, limit = 5): Promise<Tweet[]> {
  for (const query of buildQueryCandidates(keyword)) {
    try {
      const tweets = await searchTweets(query, limit);
      if (tweets.length > 0) return tweets;
    } catch {
      // try the next, broader candidate
    }
  }
  return [];
}

function cleanDisplayText(text: string): string {
  return text
    .replace(/\tSTART\t/g, '')
    .replace(/\tEND\t/g, '')
    .replace(/https?:\/\/t\.co\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const X_LOGO_SVG =
  '<svg class="tweet-embed__logo" viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';

const PLAY_BADGE_SVG =
  '<svg class="tweet-embed__play" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11"/><path d="M9.5 7.5v9l7-4.5z"/></svg>';

function renderMedia(tweet: Tweet): string {
  if (tweet.media.length === 0) return '';

  const alt = escapeHtml(`${tweet.name}さんの投稿画像`);
  const items = tweet.media.map((m) => {
    const dims =
      m.width && m.height ? ` width="${m.width}" height="${m.height}"` : '';
    const img =
      `<img src="${escapeHtml(m.url)}" alt="${alt}" loading="lazy" decoding="async"${dims}` +
      ` onerror="this.closest('.tweet-embed__media').remove()">`;
    return m.type === 'video'
      ? `<span class="tweet-embed__media-item tweet-embed__media-item--video">${img}${PLAY_BADGE_SVG}</span>`
      : `<span class="tweet-embed__media-item">${img}</span>`;
  });

  return `<span class="tweet-embed__media" data-count="${tweet.media.length}">${items.join('')}</span>`;
}

/**
 * Renders tweets as embed-style cards (raw HTML inside the Markdown body).
 * Kept on a single line per card so the Markdown parser treats the whole
 * block as one HTML block and leaves the tweet text untouched.
 */
export function formatTweetsHtml(tweets: Tweet[]): string {
  if (tweets.length === 0) return '';

  const cards = tweets.map((t) => {
    const date = new Date(t.createdAt * 1000);
    const dateStr = date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    });

    const avatar = t.avatar
      ? `<img class="tweet-embed__avatar" src="${escapeHtml(t.avatar)}" alt="" loading="lazy" decoding="async" width="40" height="40" onerror="this.remove()">`
      : '';

    const head =
      `<span class="tweet-embed__head">${avatar}` +
      `<span class="tweet-embed__author">` +
      `<span class="tweet-embed__name">${escapeHtml(t.name)}</span>` +
      `<span class="tweet-embed__handle">@${escapeHtml(t.screenName)}</span>` +
      `</span>${X_LOGO_SVG}</span>`;

    const text = t.text
      ? `<span class="tweet-embed__text">${escapeHtml(t.text)}</span>`
      : '';

    const meta =
      `<span class="tweet-embed__meta">` +
      `<time datetime="${date.toISOString()}">${dateStr}</time>` +
      `<span class="tweet-embed__stats">` +
      `<span>♡ ${t.likesCount.toLocaleString('en-US')}</span>` +
      `<span>⇄ ${t.rtCount.toLocaleString('en-US')}</span>` +
      `</span></span>`;

    return `<a class="tweet-embed" href="${escapeHtml(t.url)}" target="_blank" rel="noopener nofollow">${head}${text}${renderMedia(t)}${meta}</a>`;
  });

  return `## ネットの反応\n\n<div class="tweet-embeds">\n${cards.join('\n')}\n</div>`;
}

export interface Tweet {
  id: string;
  text: string;
  name: string;
  screenName: string;
  url: string;
  createdAt: number;
  rtCount: number;
  likesCount: number;
}

export async function fetchTweets(
  keyword: string,
  limit = 5
): Promise<Tweet[]> {
  try {
    const url = `https://search.yahoo.co.jp/realtime/search?p=${encodeURIComponent(keyword)}&rkf=1`;

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
    const entries: any[] =
      data?.props?.pageProps?.pageData?.timeline?.entry ?? [];

    return entries
      .filter((e) => !e.inReplyTo)
      .map((e) => ({
        id: e.id,
        text: cleanDisplayText(e.displayTextBody ?? e.displayText ?? ''),
        name: e.name,
        screenName: e.screenName,
        url: `https://x.com/${e.screenName}/status/${e.id}`,
        createdAt: e.createdAt,
        rtCount: e.rtCount ?? 0,
        likesCount: e.likesCount ?? 0,
      }))
      .sort((a, b) => b.rtCount + b.likesCount - (a.rtCount + a.likesCount))
      .slice(0, limit);
  } catch {
    return [];
  }
}

function cleanDisplayText(text: string): string {
  return text
    .replace(/\tSTART\t/g, '')
    .replace(/\tEND\t/g, '')
    .replace(/https?:\/\/t\.co\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatTweetsMarkdown(tweets: Tweet[]): string {
  if (tweets.length === 0) return '';

  const lines = tweets.map((t) => {
    const date = new Date(t.createdAt * 1000);
    const timeStr = date.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    });
    return `> ${t.text}\n> — ${t.name}（[@${t.screenName}](${t.url})）${timeStr}`;
  });

  return `## ネットの反応\n\n${lines.join('\n\n')}`;
}

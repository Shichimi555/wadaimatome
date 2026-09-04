/**
 * Pulls the text of the news stories behind a trend.
 *
 * Gemini gets its facts from Google Search grounding, which Workers AI has no
 * equivalent for. Fetching the linked stories ourselves fills that gap, and has
 * the side benefit of being inspectable: the log says exactly what the model was
 * shown.
 */

export interface NewsSource {
  title: string;
  url: string;
  text: string;
}

/** Enough for the lede and the body of a news story; the tail is boilerplate. */
const MAX_CHARS_PER_SOURCE = 4000;
/** Below this a "page" is a cookie banner or a paywall, not a story. */
const MIN_USEFUL_CHARS = 200;
const FETCH_TIMEOUT_MS = 8000;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);
}

/**
 * Reduces a news page to its prose. Deliberately crude -- a real extractor is a
 * project of its own, and the model tolerates some navigation noise as long as
 * the story is in there.
 */
export function extractReadableText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** og:description is the last resort for a page rendered entirely in JavaScript. */
export function extractDescription(html: string): string {
  const match =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  return match ? decodeEntities(match[1]).trim() : '';
}

async function fetchOne(item: { title: string; url: string }): Promise<NewsSource | null> {
  try {
    const res = await fetch(item.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WadaimatomeBot/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const html = await res.text();

    let text = extractReadableText(html).slice(0, MAX_CHARS_PER_SOURCE);
    // NHK and other JS-rendered sites hand back a shell with no prose in it.
    // The meta description is thin, but it beats leaving the story out.
    if (text.length < MIN_USEFUL_CHARS) text = extractDescription(html);
    if (text.length < MIN_USEFUL_CHARS / 4) return null;

    return { title: item.title, url: item.url, text };
  } catch {
    return null;
  }
}

export async function fetchNewsSources(
  items: { title: string; url: string }[],
  limit = 5
): Promise<NewsSource[]> {
  const candidates = items.filter((i) => i.url).slice(0, limit);
  const results = await Promise.all(candidates.map(fetchOne));
  return results.filter((r): r is NewsSource => r !== null);
}

export function formatSources(sources: NewsSource[]): string {
  return sources.map((s) => `## ${s.title}\n${s.text}`).join('\n\n');
}

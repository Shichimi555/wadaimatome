/** X counts a tweet in weighted characters, not code points. */
export const TWEET_LIMIT = 280;

/** Every link is rewritten to t.co, so its length is fixed regardless of the URL. */
const URL_WEIGHT = 23;
const URL_PATTERN = /https?:\/\/\S+/g;

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

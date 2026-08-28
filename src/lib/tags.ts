import type { CollectionEntry } from 'astro:content';

/**
 * A tag page listing a single article is a duplicate of that article with a
 * worse title. The site had 2,713 tag pages for 918 articles and 78% of them
 * held exactly one article; Search Console left 882 pages as
 * "検出 - インデックス未登録" and another 347 as "クロール済み - インデックス未登録",
 * which is Google declining to spend crawl budget on them. Measured over the
 * reporting week, tag pages took 23% of all impressions and converted at 1.6%
 * against 4.6% for article pages.
 *
 * So a tag earns a page only once it groups something.
 */
export const MIN_TAG_ARTICLES = 2;

export function countTags(articles: CollectionEntry<'articles'>[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const article of articles) {
    for (const tag of article.data.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

/** Tags that group at least MIN_TAG_ARTICLES articles, so have a page. */
export function indexableTags(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .filter(([, n]) => n >= MIN_TAG_ARTICLES)
    .map(([tag]) => tag);
}

/**
 * Splits an article's tags into the ones that link somewhere and the ones that
 * are shown as plain labels. Linking to a page that is not generated would
 * hand Googlebot a 404 on every article.
 */
export function splitTags(
  tags: string[],
  counts: Map<string, number>
): { linked: string[]; plain: string[] } {
  const linked: string[] = [];
  const plain: string[] = [];
  for (const tag of tags) {
    ((counts.get(tag) ?? 0) >= MIN_TAG_ARTICLES ? linked : plain).push(tag);
  }
  return { linked, plain };
}

/**
 * The tag that best stands in for a category in a breadcrumb: the one holding
 * the most articles. Article order puts the trend keyword first, which is
 * usually a one-off name, so the first linkable tag tends to be an incidental
 * word like 「復活」 rather than 「音楽番組」.
 */
export function breadcrumbTag(tags: string[], counts: Map<string, number>): string | undefined {
  let best: string | undefined;
  let bestCount = 0;
  for (const tag of tags) {
    const count = counts.get(tag) ?? 0;
    if (count >= MIN_TAG_ARTICLES && count > bestCount) {
      best = tag;
      bestCount = count;
    }
  }
  return best;
}

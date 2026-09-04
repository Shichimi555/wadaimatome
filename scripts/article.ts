import type { TrendItem } from './trends';
import type { ArticleDraft } from './draft';
import { fetchOgImage } from './ogimage';
import { fetchTweets, formatTweetsHtml } from './tweets';

export interface GeneratedArticle {
  title: string;
  description: string;
  body: string;
  tags: string[];
  trendKeyword: string;
  trafficVolume: number;
  pubDate: string;
  heroImage: string;
}

/** Writes the article text for a trend. Which model does it is the caller's choice. */
export type Drafter = (trend: TrendItem) => Promise<ArticleDraft>;

async function pickHeroImage(trend: TrendItem): Promise<string> {
  for (const news of trend.newsItems) {
    if (!news.url) continue;
    const image = await fetchOgImage(news.url);
    if (image) return image;
  }
  return trend.picture || trend.newsItems.find((n) => n.picture)?.picture || '';
}

/**
 * Everything that happens to an article regardless of who wrote it: the hero
 * image, the real tweets, the timestamp. Keeping it here is what lets the two
 * engines stay interchangeable.
 */
export async function generateArticle(
  trend: TrendItem,
  draft: Drafter
): Promise<GeneratedArticle> {
  const written = await draft(trend);

  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const pubDate = jst.toISOString().replace('Z', '+09:00');

  const heroImage = await pickHeroImage(trend);

  // Always drop any "ネットの反応" the model wrote: its quotes are invented.
  // Real tweets are appended below when we manage to fetch them.
  let body = written.body.replace(/## ネットの反応[\s\S]*?(?=## |$)/, '').trimEnd();

  const tweets = await fetchTweets(trend.title);
  if (tweets.length > 0) {
    body = body + '\n\n' + formatTweetsHtml(tweets);
  } else {
    console.warn(`No tweets found for "${trend.title}"`);
  }

  return {
    title: written.title,
    description: written.description,
    body,
    tags: written.tags,
    trendKeyword: trend.title,
    trafficVolume: trend.traffic,
    pubDate,
    heroImage,
  };
}

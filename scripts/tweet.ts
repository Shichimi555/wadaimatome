import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { pathToFileURL } from 'node:url';
import { breakingWeightOfText } from './trends';
import { buildTweet } from './x';
import { articleUrl } from './urls';
import {
  postTweet,
  ComposeMismatchError,
  PostRejectedError,
  PostUnconfirmedError,
  SessionExpiredError,
  WrongAccountError,
} from './x-browser';

const ARTICLES_DIR = './src/content/articles';
const HISTORY_PATH = './data/tweet-history.json';

/**
 * Only breaking news gets tweeted. The site publishes ~32 articles a day;
 * posting all of them from a young account, every one an auto-generated post
 * carrying an outbound link, is the shape of a spam account. Weight 3 is the
 * weather/disaster and incident/accident tier from trends.ts.
 */
const MIN_BREAKING_WEIGHT = Number(process.env.TWEET_MIN_WEIGHT) || 3;
const DAILY_LIMIT = Number(process.env.TWEET_DAILY_LIMIT) || 5;
const PER_RUN_LIMIT = Number(process.env.TWEET_PER_RUN) || 1;
/** Older than this and the news has stopped being news. */
const MAX_AGE_HOURS = Number(process.env.TWEET_MAX_AGE_HOURS) || 24;
const HISTORY_LIMIT = 500;

export interface ArticleMeta {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  pubDate: Date;
}

export interface PostedEntry {
  slug: string;
  at: string;
  url?: string;
}

export interface TweetHistory {
  posted: PostedEntry[];
}

/** Calendar day in JST, as YYYY-MM-DD. */
export function jstDay(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

function frontmatterField(content: string, field: string): string {
  const match = content.match(new RegExp(`^${field}:\\s*"?(.+?)"?\\s*$`, 'm'));
  return match ? match[1] : '';
}

export function parseArticle(fileName: string, content: string): ArticleMeta | null {
  if (/^draft:\s*true\s*$/m.test(content)) return null;

  const pubDate = new Date(frontmatterField(content, 'pubDate'));
  if (Number.isNaN(pubDate.valueOf())) return null;

  let tags: string[] = [];
  const tagMatch = content.match(/^tags:\s*(\[.+?\])\s*$/m);
  if (tagMatch) {
    try {
      tags = JSON.parse(tagMatch[1]);
    } catch {
      tags = [];
    }
  }

  return {
    slug: fileName.replace(/\.md$/, ''),
    title: frontmatterField(content, 'title'),
    description: frontmatterField(content, 'description'),
    tags,
    pubDate,
  };
}

/**
 * Words that describe how something is reported rather than what happened.
 * They are useful when ranking Google Trends headlines, but the article
 * descriptions here are written by the model, which sprinkles "〜を速報" over
 * ordinary sports and entertainment copy.
 */
const REPORTING_WORDS = ['速報', '緊急'];

/** Compounds where a keyword is figurative: 打線爆発 is not an explosion. */
const FIGURATIVE_PHRASES = ['打線爆発', '人気爆発', '爆発的', '爆発力'];

/**
 * Stricter than the trend ranking this shares a word list with. The title and
 * tags are factual; the description is marketing copy, so it is not consulted.
 * Measured over the 602 published articles this cuts the hit rate from 28% to
 * 19% -- about 6 a day, comfortably above the 5-a-day cap.
 */
export function breakingScore(article: ArticleMeta): number {
  let haystack = [article.title, ...article.tags].join(' ');
  for (const phrase of FIGURATIVE_PHRASES) haystack = haystack.split(phrase).join('');
  return breakingWeightOfText(haystack, REPORTING_WORDS);
}

/**
 * Picks what to post this run: recent, breaking, not already posted, newest
 * first, and within both the per-run and per-day caps.
 */
export function selectArticles(
  articles: ArticleMeta[],
  history: TweetHistory,
  now: Date,
  opts: {
    minWeight?: number;
    dailyLimit?: number;
    perRunLimit?: number;
    maxAgeHours?: number;
  } = {}
): ArticleMeta[] {
  const minWeight = opts.minWeight ?? MIN_BREAKING_WEIGHT;
  const dailyLimit = opts.dailyLimit ?? DAILY_LIMIT;
  const perRunLimit = opts.perRunLimit ?? PER_RUN_LIMIT;
  const maxAgeHours = opts.maxAgeHours ?? MAX_AGE_HOURS;

  const today = jstDay(now);
  const postedToday = history.posted.filter((p) => jstDay(new Date(p.at)) === today).length;
  const budget = Math.min(perRunLimit, dailyLimit - postedToday);
  if (budget <= 0) return [];

  const alreadyPosted = new Set(history.posted.map((p) => p.slug));
  const oldest = now.valueOf() - maxAgeHours * 3600_000;

  return articles
    .filter((a) => !alreadyPosted.has(a.slug))
    .filter((a) => a.pubDate.valueOf() >= oldest && a.pubDate.valueOf() <= now.valueOf())
    .filter((a) => breakingScore(a) >= minWeight)
    .sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf())
    .slice(0, budget);
}

async function readHistory(path: string): Promise<TweetHistory> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8'));
    return { posted: Array.isArray(parsed?.posted) ? parsed.posted : [] };
  } catch {
    return { posted: [] };
  }
}

async function writeHistory(path: string, history: TweetHistory): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const trimmed = { posted: history.posted.slice(-HISTORY_LIMIT) };
  await writeFile(path, JSON.stringify(trimmed, null, 2) + '\n', 'utf-8');
}

async function loadArticles(dir: string): Promise<ArticleMeta[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
  const articles: ArticleMeta[] = [];
  for (const file of files) {
    const parsed = parseArticle(file, await readFile(join(dir, file), 'utf-8'));
    if (parsed) articles.push(parsed);
  }
  return articles;
}

async function main() {
  // '1' composes and prints without opening a browser, so the selection can be
  // checked without a session. 'browser' fills the composer but never posts.
  const dryRun = process.env.TWEET_DRY_RUN;
  const cookiePath = process.env.X_COOKIE_PATH;
  if (!cookiePath && dryRun !== '1') {
    console.error('X_COOKIE_PATH is not set');
    process.exit(1);
  }

  const now = new Date();
  const history = await readHistory(HISTORY_PATH);
  const articles = await loadArticles(ARTICLES_DIR);
  const selected = selectArticles(articles, history, now);

  const postedToday = history.posted.filter((p) => jstDay(new Date(p.at)) === jstDay(now)).length;
  console.log(
    `[INFO] ${articles.length} article(s) on disk, ${postedToday}/${DAILY_LIMIT} posted today, ${selected.length} to post now`
  );

  if (selected.length === 0) {
    console.log('[INFO] Nothing to tweet');
    return;
  }

  for (const article of selected) {
    const text = buildTweet({
      title: article.title,
      description: article.description,
      url: articleUrl(article.slug),
      tags: article.tags,
    });
    console.log(`[INFO] Posting ${article.slug} (weight x${breakingScore(article)})\n${text}`);

    if (dryRun === '1') {
      console.log('[DRY RUN] Not opening a browser, not posting.');
      continue;
    }

    const url = await postTweet(text, {
      cookiePath: cookiePath!,
      dryRun: dryRun === 'browser',
      expectedHandle: process.env.X_HANDLE || 'wadaiimatome',
    });
    if (dryRun) continue;

    history.posted.push({ slug: article.slug, at: now.toISOString(), url: url || undefined });
    await writeHistory(HISTORY_PATH, history);
    console.log(`[INFO] Posted: ${url || '(url unknown)'}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    if (err instanceof PostUnconfirmedError) {
      console.error(`[ERROR] ${err.message}`);
      console.error('[ERROR] Not recorded as posted. Verify the account manually.');
    } else if (err instanceof PostRejectedError) {
      console.error(`[ERROR] ${err.message}`);
      console.error('[ERROR] Nothing was posted.');
    } else if (err instanceof ComposeMismatchError) {
      console.error(`[ERROR] ${err.message}`);
      console.error('[ERROR] Nothing was posted. The composer selectors probably changed.');
    } else if (err instanceof WrongAccountError) {
      console.error(`[ERROR] ${err.message}`);
      console.error('[ERROR] Re-export the cookies from a browser signed in only as that account.');
    } else if (err instanceof SessionExpiredError) {
      console.error(`[ERROR] ${err.message}`);
      console.error('[ERROR] Re-export the X cookies and try again.');
    } else {
      console.error('[ERROR] Tweet run failed:', err);
    }
    process.exit(1);
  });
}

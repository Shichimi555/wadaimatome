import { pathToFileURL } from 'node:url';
import { resolve } from 'path';
import { fetchTrends, rankTrends, breakingWeight } from './trends';
import { filterNewTrends, loadExistingArticles } from './dedup';
import { generateArticle } from './article';
import { writeArticle, toSlug } from './markdown';
import { articleUrl } from './urls';
import { buildTweet } from './x';
import { sendDiscordNotification } from './notify';
import { isQuotaExhausted } from './retry';

const ARTICLES_DIR = './src/content/articles';
const MAX_ARTICLES = 5;
const GITHUB_REPO = 'Shichimi555/wadaimatome';

/** Discord rejects the whole webhook call if an embed description exceeds this. */
const EMBED_DESCRIPTION_LIMIT = 4096;

export interface PublishedArticle {
  title: string;
  slug: string;
  description: string;
  tags: string[];
}

function editUrl(slug: string): string {
  // Slugs keep Japanese characters, and full-width brackets survive toSlug --
  // unencoded they would cut a Discord markdown link short.
  return `https://github.com/${GITHUB_REPO}/edit/main/src/content/articles/${encodeURIComponent(slug)}.md`;
}

/**
 * Error text reaches Discord, and an SDK that failed mid-request tends to quote
 * the URL it called -- API key and all. Anything long enough to be a credential
 * is replaced rather than forwarded.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/([?&](?:key|token|api_?key)=)[^&\s]+/gi, '$1***')
    .replace(/\b(?:AIza|ghp_|github_pat_)[A-Za-z0-9_-]{10,}/g, '***')
    .replace(/https:\/\/discord(?:app)?\.com\/api\/webhooks\/\S+/gi, '***');
}

export interface FailedArticle {
  trend: string;
  error: string;
}

/**
 * The one line worth reading. A Gemini failure arrives as a stack wrapped
 * around a JSON body, and the body's own message is the part that says whether
 * to wait it out or go fix something.
 */
export function describeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: unknown } | null)?.status;

  let detail = raw.split('\n')[0].trim();
  const body = raw.match(/\{[\s\S]*\}/);
  if (body) {
    try {
      const parsed = JSON.parse(body[0])?.error;
      if (parsed?.message) {
        detail = [parsed.status, parsed.message].filter(Boolean).join(': ');
      }
    } catch {
      // Not JSON after all; the first line already covers it.
    }
  }

  const prefix = typeof status === 'number' ? `${status} ` : '';
  return redactSecrets(prefix + detail).slice(0, 400);
}

/**
 * When the model is overloaded every article in the batch fails the same way,
 * so the errors are grouped and the keywords listed under each.
 */
export function buildFailureReport(failed: FailedArticle[]): string {
  const groups = new Map<string, string[]>();
  for (const f of failed) {
    const trends = groups.get(f.error);
    if (trends) trends.push(f.trend);
    else groups.set(f.error, [f.trend]);
  }

  return [...groups]
    .map(([error, trends]) => `\`\`\`\n${error}\n\`\`\`\n対象: ${trends.join('、')}`)
    .join('\n');
}

/**
 * One block per article: the live URL, an edit link for fixing what the model
 * got wrong, and a ready-to-paste promotion tweet. The auto-poster only takes
 * breaking news (see tweet.ts), so everything else is promoted by hand or not
 * at all.
 */
export function buildPublishNotification(articles: PublishedArticle[]): string {
  const blocks = articles.map((a) => {
    const url = articleUrl(a.slug);
    const tweet = buildTweet({
      title: a.title,
      description: a.description,
      url,
      tags: a.tags,
    });
    return `**${a.title}**\n🔗 ${url}\n[✏️ 編集](${editUrl(a.slug)})\n\n🐦 宣伝ツイート案:\n\`\`\`\n${tweet}\n\`\`\``;
  });

  let description = blocks.join('\n\n');
  // Trimming beats losing the notification to a 400.
  while (blocks.length > 1 && description.length > EMBED_DESCRIPTION_LIMIT) {
    blocks.pop();
    description = `${blocks.join('\n\n')}\n\n…ほか${articles.length - blocks.length}件`;
  }
  return description.slice(0, EMBED_DESCRIPTION_LIMIT);
}

async function notify(payload: Parameters<typeof sendDiscordNotification>[0]): Promise<void> {
  await sendDiscordNotification(payload);
  console.log('Discord notification sent');
}

/**
 * Every run says something. A run that generated nothing looks exactly like a
 * run that never fired, and the scheduler this used to sit on dropped most of
 * its runs, so silence has to mean "did not run" and nothing else.
 */
async function report(webhookUrl: string | undefined, outcome: {
  published: PublishedArticle[];
  failed: FailedArticle[];
  trends: number;
  quotaExhausted?: boolean;
}): Promise<void> {
  if (!webhookUrl) return;

  const { published, failed, trends, quotaExhausted } = outcome;
  // Say it once, plainly. Otherwise the reader has to decode a quota dump every
  // hour until the budget resets at midnight Pacific (16:00 JST).
  const quotaLine = quotaExhausted
    ? '\n\n🚧 API の1日あたりの上限に達したため、この回は打ち切りました（上限は太平洋時間の0時＝JST 16時にリセット）'
    : '';
  const failureLine =
    failed.length > 0 ? `\n\n⚠️ ${failed.length}件の生成に失敗\n${buildFailureReport(failed)}` : '';

  if (published.length > 0) {
    await notify({
      webhookUrl,
      embeds: [
        {
          title: `🚀 記事を公開しました（${published.length}件）`,
          description: (buildPublishNotification(published) + failureLine + quotaLine).slice(
            0,
            EMBED_DESCRIPTION_LIMIT
          ),
          color: 0x22c55e,
        },
      ],
    });
    return;
  }

  if (failed.length > 0) {
    await notify({
      webhookUrl,
      embeds: [
        {
          title: `⚠️ 記事を1件も公開できませんでした（${failed.length}件失敗）`,
          description: (buildFailureReport(failed) + quotaLine).slice(0, EMBED_DESCRIPTION_LIMIT),
          color: 0xef4444,
        },
      ],
    });
    return;
  }

  if (trends === 0) {
    await notify({
      webhookUrl,
      content: '⚠️ トレンドを1件も取得できませんでした（取得元の障害か仕様変更の可能性）',
    });
    return;
  }

  await notify({
    webhookUrl,
    content: `🈳 新規トレンドなし（取得${trends}件・すべて既出）`,
  });
}

async function main() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  console.log('Fetching trends...');
  const trends = await fetchTrends();
  console.log(`Found ${trends.length} trending keywords`);

  const existing = await loadExistingArticles(ARTICLES_DIR);
  const newTrends = filterNewTrends(trends, existing);
  console.log(`${newTrends.length} new trends after dedup`);

  const selected = rankTrends(newTrends).slice(0, MAX_ARTICLES);
  for (const t of selected) {
    console.log(`  picked: ${t.title} (traffic=${t.traffic}, weight=x${breakingWeight(t)})`);
  }

  const published: PublishedArticle[] = [];
  const failed: FailedArticle[] = [];

  let quotaExhausted = false;

  for (const [i, trend] of selected.entries()) {
    try {
      console.log(`Generating article for: ${trend.title}`);
      const article = await generateArticle(trend);
      const path = await writeArticle(article, ARTICLES_DIR);
      const slug = toSlug(article.trendKeyword, new Date(article.pubDate));
      published.push({
        title: article.title,
        slug,
        description: article.description,
        tags: article.tags,
      });
      console.log(`Written: ${path}`);
    } catch (err) {
      console.error(`Failed to generate article for "${trend.title}":`, err);
      failed.push({ trend: trend.title, error: describeError(err) });

      // The day's request budget is gone, so every remaining trend would spend
      // a request to be told the same thing. Stop and leave them for a later
      // run -- they stay in the trend feed, and dedup will still see them.
      if (isQuotaExhausted(err)) {
        quotaExhausted = true;
        const skipped = selected.length - i - 1;
        if (skipped > 0) console.warn(`Quota exhausted, skipping ${skipped} remaining trend(s)`);
        break;
      }
    }
  }

  // Reaching here with nothing published and nothing failed means dedup left
  // no candidates: rankTrends only shrinks a non-empty list.
  await report(webhookUrl, { published, failed, trends: trends.length, quotaExhausted });

  // A batch where every article failed is a failed run, and cron should see a
  // non-zero exit. Set the code rather than throwing: report() has already
  // said so on Discord, and the top-level handler would say it twice.
  if (published.length === 0 && failed.length > 0) {
    console.error(`Generated 0 of ${failed.length} article(s)`);
    process.exitCode = 1;
  }
  console.log('Done');
}

// Only generate when run as a script: importing this module for its helpers
// must not start a run.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(async (err) => {
    console.error('Generation failed:', err);
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      await sendDiscordNotification({
        webhookUrl,
        embeds: [
          {
            title: '⚠️ 記事生成が異常終了しました',
            description: `\`\`\`\n${redactSecrets(String(err instanceof Error ? err.stack || err.message : err)).slice(0, 1500)}\n\`\`\``,
            color: 0xef4444,
          },
        ],
      });
    }
    process.exit(1);
  });
}

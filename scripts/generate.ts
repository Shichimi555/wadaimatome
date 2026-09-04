import { pathToFileURL } from 'node:url';
import { resolve } from 'path';
import { fetchTrends, rankTrends, breakingWeight } from './trends';
import { filterNewTrends, loadExistingArticles } from './dedup';
import { generateArticle } from './article';
import { writeArticle, toSlug } from './markdown';
import { articleUrl } from './urls';
import { buildTweet } from './x';
import { sendDiscordNotification } from './notify';

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

async function main() {
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
  if (selected.length === 0) {
    console.log('No new trends to process');
    return;
  }

  const written: PublishedArticle[] = [];

  for (const trend of selected) {
    try {
      console.log(`Generating article for: ${trend.title}`);
      const article = await generateArticle(trend);
      const path = await writeArticle(article, ARTICLES_DIR);
      const slug = toSlug(article.trendKeyword, new Date(article.pubDate));
      written.push({
        title: article.title,
        slug,
        description: article.description,
        tags: article.tags,
      });
      console.log(`Written: ${path}`);
    } catch (err) {
      console.error(`Failed to generate article for "${trend.title}":`, err);
    }
  }

  if (written.length > 0) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      await sendDiscordNotification({
        webhookUrl,
        embeds: [
          {
            title: `🚀 記事を公開しました（${written.length}件）`,
            description: buildPublishNotification(written),
            color: 0x22c55e,
          },
        ],
      });
      console.log('Discord notification sent');
    }
  }

  console.log('Done');
}

// Only generate when run as a script: importing this module for its helpers
// must not start a run.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error('Generation failed:', err);
    process.exit(1);
  });
}

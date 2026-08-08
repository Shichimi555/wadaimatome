import { fetchTrends, rankTrends, breakingWeight } from './trends';
import { filterNewTrends, loadExistingArticles } from './dedup';
import { generateArticle } from './article';
import { writeArticle, toSlug } from './markdown';
import { sendDiscordNotification, type DiscordEmbed } from './notify';

const ARTICLES_DIR = './src/content/articles';
const MAX_ARTICLES = 5;
const GITHUB_REPO = 'Shichimi555/wadaimatome';

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

  const written: { title: string; slug: string }[] = [];

  for (const trend of selected) {
    try {
      console.log(`Generating article for: ${trend.title}`);
      const article = await generateArticle(trend);
      const path = await writeArticle(article, ARTICLES_DIR, { draft: true });
      const slug = toSlug(article.trendKeyword, new Date(article.pubDate));
      written.push({ title: article.title, slug });
      console.log(`Written (draft): ${path}`);
    } catch (err) {
      console.error(`Failed to generate article for "${trend.title}":`, err);
    }
  }

  if (written.length > 0) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      const description = written
        .map(
          (a) =>
            `**${a.title}**\n[✏️ 編集](https://github.com/${GITHUB_REPO}/edit/main/src/content/articles/${a.slug}.md)`
        )
        .join('\n\n');

      await sendDiscordNotification({
        webhookUrl,
        embeds: [
          {
            title: `📝 新しい記事を生成しました（${written.length}件）`,
            description,
            color: 0x3b82f6,
          },
          {
            title: '⏰ 30分後に自動公開されます',
            description:
              '参考ツイートがあれば、上の編集リンクから記事の本文末尾に追加してください。',
            color: 0x94a3b8,
          },
        ],
      });
      console.log('Discord notification sent');
    }
  }

  console.log('Done');
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});

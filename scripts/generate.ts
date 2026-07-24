import { fetchTrends } from './trends';
import { filterNewTrends, loadExistingArticles } from './dedup';
import { generateArticle } from './article';
import { writeArticle } from './markdown';

const ARTICLES_DIR = './src/content/articles';
const MAX_ARTICLES = 5;

async function main() {
  console.log('Fetching trends...');
  const trends = await fetchTrends();
  console.log(`Found ${trends.length} trending keywords`);

  const existing = await loadExistingArticles(ARTICLES_DIR);
  const newTrends = filterNewTrends(trends, existing);
  console.log(`${newTrends.length} new trends after dedup`);

  const selected = newTrends.slice(0, MAX_ARTICLES);
  if (selected.length === 0) {
    console.log('No new trends to process');
    return;
  }

  for (const trend of selected) {
    try {
      console.log(`Generating article for: ${trend.title}`);
      const article = await generateArticle(trend);
      const path = await writeArticle(article, ARTICLES_DIR);
      console.log(`Written: ${path}`);
    } catch (err) {
      console.error(`Failed to generate article for "${trend.title}":`, err);
    }
  }

  console.log('Done');
}

main().catch((err) => {
  console.error('Generation failed:', err);
  process.exit(1);
});

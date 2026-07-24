import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import type { TrendItem } from './trends';

export interface ExistingArticle {
  keyword: string;
  pubDate: Date;
}

export function filterNewTrends(
  trends: TrendItem[],
  existing: ExistingArticle[],
  hoursBack: number = 24
): TrendItem[] {
  const cutoff = Date.now() - hoursBack * 60 * 60 * 1000;
  const recentKeywords = new Set(
    existing
      .filter((a) => a.pubDate.getTime() > cutoff)
      .map((a) => a.keyword)
  );
  return trends.filter((t) => !recentKeywords.has(t.title));
}

export async function loadExistingArticles(dir: string): Promise<ExistingArticle[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const articles: ExistingArticle[] = [];
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const content = await readFile(join(dir, file), 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) continue;

    const pubDateMatch = match[1].match(/pubDate:\s*(.+)/);
    const keywordMatch = match[1].match(/trendKeyword:\s*"?(.+?)"?\s*$/m);

    if (pubDateMatch && keywordMatch) {
      articles.push({
        keyword: keywordMatch[1],
        pubDate: new Date(pubDateMatch[1].trim()),
      });
    }
  }

  return articles;
}

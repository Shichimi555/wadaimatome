import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { GeneratedArticle } from './article';

export function toSlug(keyword: string, date: Date): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = jst.toISOString().slice(0, 10);
  const slug = keyword
    .replace(/[\s　]+/g, '-')
    .replace(/[^\w　-鿿゠-ヿ぀-ゟ＀-￯-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${dateStr}-${slug}`;
}

function sanitizeBody(body: string): string {
  return body.replace(/<\s*\/?\s*(script|iframe|object|embed|form|input|button|style|link|meta|base)\b[^>]*>/gi, '');
}

export function toMarkdown(article: GeneratedArticle, options?: { draft?: boolean }): string {
  const escapedTitle = article.title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escapedDesc = article.description.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escapedKeyword = article.trendKeyword.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const tags = JSON.stringify(article.tags);
  const body = sanitizeBody(article.body);
  const heroLine = article.heroImage ? `\nheroImage: "${article.heroImage}"` : '';
  const draftLine = options?.draft ? '\ndraft: true' : '';

  return `---
title: "${escapedTitle}"
description: "${escapedDesc}"
pubDate: ${article.pubDate}
tags: ${tags}
trendKeyword: "${escapedKeyword}"
trafficVolume: ${article.trafficVolume}${heroLine}${draftLine}
---

${body}
`;
}

export async function writeArticle(article: GeneratedArticle, dir: string, options?: { draft?: boolean }): Promise<string> {
  await mkdir(dir, { recursive: true });
  const slug = toSlug(article.trendKeyword, new Date(article.pubDate));
  const filePath = join(dir, `${slug}.md`);
  await writeFile(filePath, toMarkdown(article, options), 'utf-8');
  return filePath;
}

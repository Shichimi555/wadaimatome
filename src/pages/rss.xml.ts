import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { articlePath } from '../lib/urls';

const FEED_SIZE = 50;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const GET: APIRoute = async ({ site }) => {
  const base = site!.href.replace(/\/$/, '');
  const articles = (await getCollection('articles', ({ data }) => data.draft !== true))
    .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf())
    .slice(0, FEED_SIZE);

  const items = articles
    .map((article) => {
      const url = `${base}${articlePath(article.id)}`;
      return [
        '<item>',
        `<title>${escapeXml(article.data.title)}</title>`,
        `<link>${url}</link>`,
        `<guid isPermaLink="true">${url}</guid>`,
        `<description>${escapeXml(article.data.description)}</description>`,
        `<pubDate>${article.data.pubDate.toUTCString()}</pubDate>`,
        ...article.data.tags.map((t) => `<category>${escapeXml(t)}</category>`),
        '</item>',
      ].join('');
    })
    .join('');

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>' +
    '<title>話題まとめ</title>' +
    `<link>${base}/</link>` +
    '<description>ネットで話題のトレンドを毎日まとめてお届け</description>' +
    '<language>ja</language>' +
    `<atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml" />` +
    `<lastBuildDate>${(articles[0]?.data.pubDate ?? new Date()).toUTCString()}</lastBuildDate>` +
    items +
    '</channel></rss>';

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};

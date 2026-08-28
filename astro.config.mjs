// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * Latest publication date per article and per tag, read straight off disk so
 * the sitemap can carry lastmod. Without it Google has no freshness hint for a
 * site publishing ~32 articles a day, and the live sitemap carried 3,692
 * <loc> and zero <lastmod>.
 */

/**
 * Astro strips punctuation such as 「・」 when it derives an id from a filename,
 * so 2026-07-25-エリック・ラウアー.md is served at .../2026-07-25-エリックラウアー/.
 * Dropping punctuation from both sides makes the two agree without having to
 * reimplement Astro's slug rules.
 *
 * @param {string} value
 */
function slugKey(value) {
  return value.replace(/[^\p{L}\p{N}-]/gu, '');
}

function collectDates() {
  const dir = './src/content/articles';
  const articles = new Map();
  const tags = new Map();

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md')) continue;
    const body = readFileSync(`${dir}/${file}`, 'utf-8');
    if (/^draft:\s*true\s*$/m.test(body)) continue;

    const dateMatch = body.match(/^pubDate:\s*"?(.+?)"?\s*$/m);
    if (!dateMatch) continue;
    const date = new Date(dateMatch[1]);
    if (Number.isNaN(date.valueOf())) continue;

    articles.set(slugKey(file.replace(/\.md$/, '')), date);

    const tagMatch = body.match(/^tags:\s*(\[.+?\])\s*$/m);
    if (!tagMatch) continue;
    let parsed = [];
    try {
      parsed = JSON.parse(tagMatch[1]);
    } catch {
      continue;
    }
    for (const tag of parsed) {
      const key = slugKey(tag);
      if (!tags.has(key) || tags.get(key) < date) tags.set(key, date);
    }
  }

  return { articles, tags };
}

const DATES = collectDates();
// Every listing page reshuffles when an article is published, so they all
// share the newest date on the site.
const NEWEST = [...DATES.articles.values()].sort((a, b) => b.valueOf() - a.valueOf())[0];

/** @param {string} url */
function lastmodFor(url) {
  const article = url.match(/\/articles\/([^/]+)\//);
  if (article) return DATES.articles.get(slugKey(decodeURIComponent(article[1])));

  const tag = url.match(/\/tags\/([^/]+)\//);
  if (tag) return DATES.tags.get(slugKey(decodeURIComponent(tag[1])));

  return NEWEST;
}

export default defineConfig({
  site: 'https://wadaimatome.com',
  output: 'static',
  // Cloudflare answers a slash-less path with a 307, which Google treats as a
  // weak canonical signal and so indexes both forms. Every URL this site emits
  // ends in a slash, so that redirect is never reached.
  trailingSlash: 'always',
  integrations: [
    sitemap({
      // /og/*.png are OGP images, not pages.
      filter: (page) => !page.includes('/og/'),
      serialize(item) {
        const date = lastmodFor(item.url);
        if (date) item.lastmod = date.toISOString();
        return item;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});

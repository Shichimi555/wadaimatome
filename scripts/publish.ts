import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { pathToFileURL } from 'node:url';
import { sendDiscordNotification } from './notify';

const ARTICLES_DIR = './src/content/articles';
const SITE_URL = process.env.SITE_URL || 'https://wadaimatome.com';

export function removeDraftFlag(content: string): string | null {
  if (!/^draft:\s*true\s*$/m.test(content)) return null;
  return content.replace(/^draft:\s*true\s*\n/m, '');
}

export function buildTweetSuggestion(opts: {
  description: string;
  url: string;
  tags: string[];
}): string {
  const hashtags = opts.tags
    .slice(0, 2)
    .map((t) => `#${t}`)
    .join(' ');
  return `${opts.description}\n${opts.url}\n${hashtags} #話題まとめ`;
}

interface PublishedArticle {
  slug: string;
  title: string;
  description: string;
  tags: string[];
}

/**
 * Canonical form of an article URL: percent-encoded with a trailing slash,
 * matching <link rel="canonical">. Anything else costs a redirect hop.
 */
export function articleUrl(slug: string, siteUrl = SITE_URL): string {
  return `${siteUrl}/articles/${encodeURIComponent(slug)}/`;
}

function extractFrontmatter(content: string, field: string): string {
  const match = content.match(new RegExp(`^${field}:\\s*"?(.+?)"?\\s*$`, 'm'));
  return match ? match[1] : '';
}

function extractTags(content: string): string[] {
  const match = content.match(/^tags:\s*(\[.+?\])\s*$/m);
  if (!match) return [];
  try {
    return JSON.parse(match[1]);
  } catch {
    return [];
  }
}

async function main() {
  const files = await readdir(ARTICLES_DIR);
  const mdFiles = files.filter((f) => f.endsWith('.md'));

  const published: PublishedArticle[] = [];

  for (const file of mdFiles) {
    const filePath = join(ARTICLES_DIR, file);
    const content = await readFile(filePath, 'utf-8');
    const updated = removeDraftFlag(content);
    if (updated === null) continue;

    await writeFile(filePath, updated, 'utf-8');
    const slug = file.replace(/\.md$/, '');
    published.push({
      slug,
      title: extractFrontmatter(updated, 'title'),
      description: extractFrontmatter(updated, 'description'),
      tags: extractTags(updated),
    });
    console.log(`Published: ${file}`);
  }

  if (published.length === 0) {
    console.log('No drafts to publish');
    return;
  }

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (webhookUrl) {
    const description = published
      .map((a) => {
        const url = articleUrl(a.slug);
        const tweet = buildTweetSuggestion({
          description: a.description,
          url,
          tags: a.tags,
        });
        return `**${a.title}**\n🔗 ${url}\n\n🐦 宣伝ツイート案:\n\`\`\`\n${tweet}\n\`\`\``;
      })
      .join('\n\n');

    await sendDiscordNotification({
      webhookUrl,
      embeds: [
        {
          title: `🚀 記事を公開しました（${published.length}件）`,
          description,
          color: 0x22c55e,
        },
      ],
    });
    console.log('Discord publish notification sent');
  }

  console.log('Done');
}

// Only publish when run as a script: importing this module for its helpers
// must not rewrite article files.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Publish failed:', err);
    process.exit(1);
  });
}

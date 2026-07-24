# Discord Notification Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Discord notifications to the article pipeline with a draft→publish two-phase workflow that gives the user a 30-minute window to add reference tweets before auto-publishing.

**Architecture:** Articles are generated with `draft: true` in frontmatter (hidden from the live site). A second cron job 30 minutes later removes the draft flag and publishes. Both phases send Discord webhook notifications — generation phase requests reference tweet collection, publish phase provides article URLs and promotional tweet suggestions.

**Tech Stack:** TypeScript (tsx), Discord Webhook API (plain fetch), GitHub Actions cron

## Global Constraints

- Discord notification failures MUST NOT block article generation or publishing (try/catch, log-only)
- When `DISCORD_WEBHOOK_URL` env var is missing, skip notifications silently (no error, no exit)
- All scripts run via `tsx` under Node 22
- Tests use vitest; run with `NODENV_VERSION=25.2.1 npx vitest run`
- GitHub repo: `Shichimi555/wadaimatome`, site URL: `https://wadaimatome.shichimi.workers.dev`
- The `getCollection('articles')` filter callback syntax is: `getCollection('articles', ({ data }) => data.draft !== true)`

---

### Task 1: Discord Notification Module

**Files:**
- Create: `scripts/notify.ts`
- Create: `scripts/__tests__/notify.test.ts`

**Interfaces:**
- Consumes: nothing (standalone module)
- Produces:
  - `interface DiscordEmbed { title: string; description: string; url?: string; color?: number; thumbnail?: { url: string } }`
  - `async function sendDiscordNotification(options: { webhookUrl: string; content?: string; embeds?: DiscordEmbed[] }): Promise<void>` — POSTs JSON to Discord webhook URL. Logs errors but never throws.

- [ ] **Step 1: Write tests for notification payload and error handling**

Create `scripts/__tests__/notify.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendDiscordNotification } from '../notify';

describe('sendDiscordNotification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should POST JSON payload to webhook URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', { status: 200 }));

    await sendDiscordNotification({
      webhookUrl: 'https://discord.com/api/webhooks/test',
      content: 'Hello',
      embeds: [{ title: 'Test', description: 'Body', color: 0x3b82f6 }],
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://discord.com/api/webhooks/test');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    const body = JSON.parse(init?.body as string);
    expect(body.content).toBe('Hello');
    expect(body.embeds).toHaveLength(1);
    expect(body.embeds[0].title).toBe('Test');
  });

  it('should not throw on fetch failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      sendDiscordNotification({
        webhookUrl: 'https://discord.com/api/webhooks/test',
        content: 'Hello',
      })
    ).resolves.toBeUndefined();

    expect(consoleSpy).toHaveBeenCalledOnce();
  });

  it('should log warning on non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('rate limited', { status: 429 }));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await sendDiscordNotification({
      webhookUrl: 'https://discord.com/api/webhooks/test',
      content: 'Hello',
    });

    expect(consoleSpy).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODENV_VERSION=25.2.1 npx vitest run scripts/__tests__/notify.test.ts`
Expected: FAIL — `../notify` module not found

- [ ] **Step 3: Implement the notification module**

Create `scripts/notify.ts`:

```ts
export interface DiscordEmbed {
  title: string;
  description: string;
  url?: string;
  color?: number;
  thumbnail?: { url: string };
}

interface NotifyOptions {
  webhookUrl: string;
  content?: string;
  embeds?: DiscordEmbed[];
}

export async function sendDiscordNotification(options: NotifyOptions): Promise<void> {
  try {
    const res = await fetch(options.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: options.content,
        embeds: options.embeds,
      }),
    });
    if (!res.ok) {
      console.error(`Discord webhook returned ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error('Failed to send Discord notification:', err);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `NODENV_VERSION=25.2.1 npx vitest run scripts/__tests__/notify.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/notify.ts scripts/__tests__/notify.test.ts
git commit -m "feat: add Discord webhook notification module"
```

---

### Task 2: Draft Support in Content Schema and Markdown Output

**Files:**
- Modify: `src/content.config.ts`
- Modify: `scripts/markdown.ts`
- Modify: `scripts/__tests__/markdown.test.ts`

**Interfaces:**
- Consumes: `GeneratedArticle` from `scripts/article.ts` (unchanged — no `draft` field on this interface; draft flag is added by `toMarkdown`)
- Produces:
  - `toMarkdown(article, options?)` gains an optional second param `{ draft?: boolean }`. When `draft` is true, outputs `draft: true` in frontmatter.
  - Content schema gains `draft: z.boolean().optional()`

- [ ] **Step 1: Add tests for draft frontmatter output**

Add to `scripts/__tests__/markdown.test.ts`, inside the existing `describe('toMarkdown', ...)` block:

```ts
  it('should include draft: true when draft option is set', () => {
    const article: GeneratedArticle = {
      title: 'ドラフト記事',
      description: 'desc',
      body: 'body',
      tags: ['tag'],
      trendKeyword: 'kw',
      trafficVolume: 100,
      pubDate: '2026-07-25T12:00:00+09:00',
      heroImage: '',
    };
    const md = toMarkdown(article, { draft: true });
    expect(md).toContain('draft: true');
  });

  it('should not include draft line when draft option is false or omitted', () => {
    const article: GeneratedArticle = {
      title: 'タイトル',
      description: 'desc',
      body: 'body',
      tags: [],
      trendKeyword: 'kw',
      trafficVolume: 0,
      pubDate: '2026-07-25T12:00:00+09:00',
      heroImage: '',
    };
    expect(toMarkdown(article)).not.toContain('draft');
    expect(toMarkdown(article, { draft: false })).not.toContain('draft');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODENV_VERSION=25.2.1 npx vitest run scripts/__tests__/markdown.test.ts`
Expected: FAIL — `toMarkdown` does not accept second argument / no `draft` in output

- [ ] **Step 3: Update `toMarkdown` to accept draft option**

In `scripts/markdown.ts`, change the `toMarkdown` function signature and add the draft line:

```ts
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
```

- [ ] **Step 4: Add `draft` to content schema**

In `src/content.config.ts`, add inside the `z.object({})`:

```ts
    heroImage: z.string().optional(),
    draft: z.boolean().optional(),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `NODENV_VERSION=25.2.1 npx vitest run scripts/__tests__/markdown.test.ts`
Expected: All tests PASS (existing + 2 new)

- [ ] **Step 6: Commit**

```bash
git add scripts/markdown.ts scripts/__tests__/markdown.test.ts src/content.config.ts
git commit -m "feat: add draft support to content schema and markdown output"
```

---

### Task 3: Draft Filter on All Pages

**Files:**
- Modify: `src/pages/[...page].astro`
- Modify: `src/pages/articles/[slug].astro`
- Modify: `src/pages/tags/[tag]/[...page].astro`
- Modify: `src/pages/og/[slug].png.ts`
- Modify: `src/components/RelatedArticles.astro`

**Interfaces:**
- Consumes: `draft: z.boolean().optional()` from content schema (Task 2)
- Produces: All `getCollection('articles')` calls now filter out drafts

Every file that calls `getCollection('articles')` must pass a filter callback. There are exactly 5 call sites. Each change is the same pattern: replace `getCollection('articles')` with `getCollection('articles', ({ data }) => data.draft !== true)`.

- [ ] **Step 1: Update `src/pages/[...page].astro`**

Change line 11:

```diff
-  const articles = await getCollection('articles');
+  const articles = await getCollection('articles', ({ data }) => data.draft !== true);
```

- [ ] **Step 2: Update `src/pages/articles/[slug].astro`**

Change line 9:

```diff
-  const articles = await getCollection('articles');
+  const articles = await getCollection('articles', ({ data }) => data.draft !== true);
```

- [ ] **Step 3: Update `src/pages/tags/[tag]/[...page].astro`**

Change line 11:

```diff
-  const articles = await getCollection('articles');
+  const articles = await getCollection('articles', ({ data }) => data.draft !== true);
```

- [ ] **Step 4: Update `src/pages/og/[slug].png.ts`**

Change line 8:

```diff
-  const articles = await getCollection('articles');
+  const articles = await getCollection('articles', ({ data }) => data.draft !== true);
```

- [ ] **Step 5: Update `src/components/RelatedArticles.astro`**

Change line 13:

```diff
-const allArticles = await getCollection('articles');
+const allArticles = await getCollection('articles', ({ data }) => data.draft !== true);
```

- [ ] **Step 6: Verify build succeeds**

Run: `NODENV_VERSION=25.2.1 npx astro build`
Expected: Build completes with no errors

- [ ] **Step 7: Run all tests to verify no regressions**

Run: `NODENV_VERSION=25.2.1 npx vitest run`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/pages/\[...page\].astro src/pages/articles/\[slug\].astro src/pages/tags/\[tag\]/\[...page\].astro src/pages/og/\[slug\].png.ts src/components/RelatedArticles.astro
git commit -m "feat: filter draft articles from all pages"
```

---

### Task 4: Generate Pipeline — Draft Mode + Notification

**Files:**
- Modify: `scripts/generate.ts`
- Modify: `scripts/markdown.ts` (only `writeArticle` call — pass `{ draft: true }`)
- Modify: `.github/workflows/generate.yml`

**Interfaces:**
- Consumes:
  - `writeArticle(article: GeneratedArticle, dir: string): Promise<string>` from `scripts/markdown.ts`
  - `sendDiscordNotification(options)` from `scripts/notify.ts` (Task 1)
  - `toSlug(keyword: string, date: Date): string` from `scripts/markdown.ts`
- Produces:
  - `writeArticle` gains optional third param `options?: { draft?: boolean }` — passed through to `toMarkdown`
  - `generate.ts` sends Discord notification after all articles are written

- [ ] **Step 1: Update `writeArticle` to accept draft option**

In `scripts/markdown.ts`, change the `writeArticle` function:

```ts
export async function writeArticle(article: GeneratedArticle, dir: string, options?: { draft?: boolean }): Promise<string> {
  await mkdir(dir, { recursive: true });
  const slug = toSlug(article.trendKeyword, new Date(article.pubDate));
  const filePath = join(dir, `${slug}.md`);
  await writeFile(filePath, toMarkdown(article, options), 'utf-8');
  return filePath;
}
```

- [ ] **Step 2: Update `generate.ts` to write drafts and send Discord notification**

Replace the full content of `scripts/generate.ts`:

```ts
import { fetchTrends } from './trends';
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

  const selected = newTrends.slice(0, MAX_ARTICLES);
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
```

- [ ] **Step 3: Update `generate.yml` to pass `DISCORD_WEBHOOK_URL`**

Replace the full content of `.github/workflows/generate.yml`:

```yaml
name: Generate Articles

on:
  schedule:
    - cron: '0 * * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm install

      - name: Generate articles
        run: npm run generate
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}

      - name: Commit and push if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add src/content/articles/
          git diff --staged --quiet && echo "No new articles" && exit 0
          git commit -m "chore: auto-generate trending articles $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          git push
```

- [ ] **Step 4: Run all tests to verify no regressions**

Run: `NODENV_VERSION=25.2.1 npx vitest run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/generate.ts scripts/markdown.ts .github/workflows/generate.yml
git commit -m "feat: generate articles as drafts and send Discord notification"
```

---

### Task 5: Publish Script + Workflow

**Files:**
- Create: `scripts/publish.ts`
- Create: `scripts/__tests__/publish.test.ts`
- Create: `.github/workflows/publish.yml`
- Modify: `package.json` (add `publish-drafts` script)

**Interfaces:**
- Consumes:
  - `sendDiscordNotification(options)` from `scripts/notify.ts` (Task 1)
- Produces:
  - `publish.ts` — CLI script that removes `draft: true` from markdown files and sends a Discord notification with published URLs + tweet suggestions

- [ ] **Step 1: Write tests for the draft-removal logic**

Create `scripts/__tests__/publish.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { removeDraftFlag, buildTweetSuggestion } from '../publish';

describe('removeDraftFlag', () => {
  it('should remove draft: true line from frontmatter', () => {
    const input = `---
title: "テスト"
description: "desc"
pubDate: 2026-07-25T12:00:00+09:00
tags: ["tag"]
trendKeyword: "kw"
trafficVolume: 100
draft: true
---

本文`;
    const result = removeDraftFlag(input);
    expect(result).not.toContain('draft: true');
    expect(result).toContain('title: "テスト"');
    expect(result).toContain('本文');
  });

  it('should return null when no draft flag is present', () => {
    const input = `---
title: "テスト"
description: "desc"
pubDate: 2026-07-25T12:00:00+09:00
tags: ["tag"]
trendKeyword: "kw"
trafficVolume: 100
---

本文`;
    expect(removeDraftFlag(input)).toBeNull();
  });
});

describe('buildTweetSuggestion', () => {
  it('should build a tweet from description, url, and tags', () => {
    const tweet = buildTweetSuggestion({
      description: 'テスト説明文',
      url: 'https://example.com/articles/test',
      tags: ['タグ1', 'タグ2'],
    });
    expect(tweet).toContain('テスト説明文');
    expect(tweet).toContain('https://example.com/articles/test');
    expect(tweet).toContain('#タグ1');
    expect(tweet).toContain('#タグ2');
    expect(tweet).toContain('#話題まとめ');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `NODENV_VERSION=25.2.1 npx vitest run scripts/__tests__/publish.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement publish script**

Create `scripts/publish.ts`:

```ts
import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { sendDiscordNotification } from './notify';

const ARTICLES_DIR = './src/content/articles';
const SITE_URL = process.env.SITE_URL || 'https://wadaimatome.shichimi.workers.dev';

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
        const url = `${SITE_URL}/articles/${a.slug}`;
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

main().catch((err) => {
  console.error('Publish failed:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `NODENV_VERSION=25.2.1 npx vitest run scripts/__tests__/publish.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Add `publish-drafts` npm script**

In `package.json`, add to `"scripts"`:

```json
"publish-drafts": "tsx scripts/publish.ts"
```

- [ ] **Step 6: Create the publish workflow**

Create `.github/workflows/publish.yml`:

```yaml
name: Publish Drafts

on:
  schedule:
    - cron: '30 * * * *'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm install

      - name: Publish drafts
        run: npm run publish-drafts
        env:
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
          SITE_URL: https://wadaimatome.shichimi.workers.dev

      - name: Commit and push if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add src/content/articles/
          git diff --staged --quiet && echo "No drafts to publish" && exit 0
          git commit -m "chore: publish draft articles"
          git push
```

- [ ] **Step 7: Run all tests to verify no regressions**

Run: `NODENV_VERSION=25.2.1 npx vitest run`
Expected: All tests PASS

- [ ] **Step 8: Verify build succeeds**

Run: `NODENV_VERSION=25.2.1 npx astro build`
Expected: Build completes

- [ ] **Step 9: Commit**

```bash
git add scripts/publish.ts scripts/__tests__/publish.test.ts .github/workflows/publish.yml package.json
git commit -m "feat: add publish-drafts script and workflow with Discord notification"
```

# 話題まとめサイト（wadaimatome）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google Trends から日本のトレンドキーワードを自動取得し、Gemini API で記事を生成して Astro 静的サイトとして Cloudflare Pages で配信する

**Architecture:** GitHub Actions cron が毎時 Google Trends RSS を取得 → Gemini で記事 Markdown を生成 → git push → Cloudflare Pages の Git 連携で自動ビルド・デプロイ。DB 不要、記事は全て git 管理の Markdown ファイル。

**Tech Stack:** Astro 5 (static), Tailwind CSS v4, satori + sharp (OGP画像), @google/genai (Gemini), fast-xml-parser (RSS), tsx (スクリプト実行), vitest (テスト)

## Global Constraints

- パッケージマネージャは **npm**（pnpm/yarn/bun 不可）
- `output: 'static'`（SSR 不使用、Cloudflare adapter 不要）
- デプロイ用 GitHub Actions workflow は作らない（Cloudflare Git 連携）
- 日時は JST（Asia/Tokyo）表示
- ダークモード必須
- モバイルファースト
- AI 生成テンプレ感を避けた控えめなデザイン

---

## File Map

```
wadaimatome/
├── astro.config.mjs           # Astro + Tailwind v4 設定
├── tsconfig.json               # TypeScript 設定
├── package.json
├── src/
│   ├── content.config.ts       # Content Collections スキーマ
│   ├── content/
│   │   └── articles/           # 生成記事 Markdown（.gitkeep + サンプル）
│   ├── styles/
│   │   └── global.css          # Tailwind import + カスタムスタイル
│   ├── layouts/
│   │   └── Base.astro          # 共通レイアウト（OGP meta, dark mode）
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── AdSlot.astro        # 広告スロット（差し替え可能）
│   │   ├── ArticleCard.astro   # 一覧用カード
│   │   ├── Pagination.astro    # ページネーション UI
│   │   └── RelatedArticles.astro
│   └── pages/
│       ├── [...page].astro     # トップ（一覧 + ページネーション）
│       ├── articles/
│       │   └── [slug].astro    # 記事詳細
│       ├── tags/
│       │   └── [tag]/
│       │       └── [...page].astro  # タグ別一覧
│       └── og/
│           └── [slug].png.ts   # OGP 画像生成エンドポイント
├── scripts/
│   ├── generate.ts             # メインオーケストレーター
│   ├── trends.ts               # Google Trends RSS 取得・パース
│   ├── dedup.ts                # 重複排除
│   ├── article.ts              # Gemini 記事生成
│   ├── markdown.ts             # Markdown ファイル出力
│   └── __tests__/
│       ├── trends.test.ts
│       ├── dedup.test.ts
│       └── markdown.test.ts
└── .github/
    └── workflows/
        └── generate.yml        # cron ワークフロー
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `src/content.config.ts`
- Create: `src/content/articles/2026-07-24-sample.md`
- Create: `src/styles/global.css`

**Interfaces:**
- Consumes: nothing
- Produces: Astro プロジェクトの基盤。Content Collections の `articles` コレクション（schema: `{ title: string, description: string, pubDate: Date, tags: string[], trendKeyword: string, trafficVolume: number }`）

- [ ] **Step 1: Astro プロジェクト初期化**

```bash
cd /home/katswsl/js/wadaimatome
npm create astro@latest . -- --template minimal --no-install --no-git --typescript strict
```

- [ ] **Step 2: 依存パッケージインストール**

```bash
npm install
npm install tailwindcss @tailwindcss/vite
npm install -D tsx vitest
```

- [ ] **Step 3: astro.config.mjs を設定**

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://wadaimatome.example.com',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});
```

- [ ] **Step 4: Tailwind CSS を設定**

```css
/* src/styles/global.css */
@import "tailwindcss";
```

- [ ] **Step 5: Content Collections スキーマ定義**

```ts
// src/content.config.ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()),
    trendKeyword: z.string(),
    trafficVolume: z.number(),
  }),
});

export const collections = { articles };
```

- [ ] **Step 6: サンプル記事を作成**

```markdown
---
title: "サンプル記事：話題まとめサイトのテスト"
description: "これは開発用のサンプル記事です"
pubDate: 2026-07-24T12:00:00+09:00
tags: ["テスト", "サンプル"]
trendKeyword: "サンプル"
trafficVolume: 10000
---

## これはサンプル記事です

開発・レイアウト確認用のサンプル記事です。本番では Google Trends のキーワードから自動生成されます。

## セクション2

ここに本文が入ります。各セクションは200〜300文字程度の想定です。

## まとめ

サンプル記事のまとめです。
```

- [ ] **Step 7: ビルド確認**

```bash
npx astro build
```

Expected: ビルド成功（ページはまだないので空の dist/ が生成される）

- [ ] **Step 8: コミット**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json src/content.config.ts src/content/articles/2026-07-24-sample.md src/styles/global.css
git commit -m "feat: scaffold Astro project with Tailwind and content collections"
```

---

### Task 2: Layout + Core Components

**Files:**
- Create: `src/layouts/Base.astro`
- Create: `src/components/Header.astro`
- Create: `src/components/Footer.astro`
- Create: `src/components/AdSlot.astro`

**Interfaces:**
- Consumes: `src/styles/global.css`
- Produces: `Base.astro` レイアウト（props: `{ title: string, description: string, ogImage?: string }`）、`AdSlot.astro`（props: `{ position: 'header' | 'article-top' | 'article-mid' | 'article-bottom' | 'footer' | 'feed' }`）

- [ ] **Step 1: Base.astro レイアウト作成**

```astro
---
// src/layouts/Base.astro
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import '../styles/global.css';

interface Props {
  title: string;
  description: string;
  ogImage?: string;
}

const { title, description, ogImage } = Astro.props;
const canonicalURL = new URL(Astro.url.pathname, Astro.site);
const ogImageURL = ogImage ? new URL(ogImage, Astro.site).href : undefined;
---

<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title} | 話題まとめ</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonicalURL} />

    <meta property="og:type" content="article" />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonicalURL} />
    {ogImageURL && <meta property="og:image" content={ogImageURL} />}

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={title} />
    <meta name="twitter:description" content={description} />
    {ogImageURL && <meta name="twitter:image" content={ogImageURL} />}
  </head>
  <body class="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <Header />
    <main class="mx-auto max-w-2xl px-4 py-8">
      <slot />
    </main>
    <Footer />
  </body>
</html>
```

- [ ] **Step 2: Header.astro 作成**

```astro
---
// src/components/Header.astro
---

<header class="border-b border-zinc-200 dark:border-zinc-800">
  <div class="mx-auto max-w-2xl px-4 py-4">
    <a href="/" class="text-lg font-bold tracking-tight">話題まとめ</a>
  </div>
</header>
```

- [ ] **Step 3: Footer.astro 作成**

```astro
---
// src/components/Footer.astro
const year = new Date().getFullYear();
---

<footer class="mt-16 border-t border-zinc-200 dark:border-zinc-800">
  <div class="mx-auto max-w-2xl px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
    <p>&copy; {year} 話題まとめ</p>
  </div>
</footer>
```

- [ ] **Step 4: AdSlot.astro 作成**

```astro
---
// src/components/AdSlot.astro
interface Props {
  position: 'header' | 'article-top' | 'article-mid' | 'article-bottom' | 'footer' | 'feed';
}

const { position } = Astro.props;
---

<div class="ad-slot my-6 flex items-center justify-center rounded bg-zinc-100 dark:bg-zinc-900" data-ad-position={position}>
  <div class="px-4 py-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
    広告スペース ({position})
  </div>
</div>
```

広告ネットワーク決定後、このコンポーネント内の HTML を広告タグに差し替える。

- [ ] **Step 5: dev サーバーで確認**

```bash
npx astro dev
```

この時点ではページがないので、次のタスクで確認する。

- [ ] **Step 6: コミット**

```bash
git add src/layouts/Base.astro src/components/Header.astro src/components/Footer.astro src/components/AdSlot.astro
git commit -m "feat: add base layout with header, footer, and ad slot components"
```

---

### Task 3: Article Detail Page

**Files:**
- Create: `src/pages/articles/[slug].astro`
- Create: `src/components/RelatedArticles.astro`

**Interfaces:**
- Consumes: `Base.astro` layout, `AdSlot.astro`, Content Collections `articles`
- Produces: 記事詳細ページ `/articles/[slug]`。RelatedArticles コンポーネント（props: `{ currentSlug: string, tags: string[], limit?: number }`）

- [ ] **Step 1: 記事詳細ページ作成**

```astro
---
// src/pages/articles/[slug].astro
import { getCollection, render } from 'astro:content';
import Base from '../../layouts/Base.astro';
import AdSlot from '../../components/AdSlot.astro';
import RelatedArticles from '../../components/RelatedArticles.astro';

export async function getStaticPaths() {
  const articles = await getCollection('articles');
  return articles.map((article) => ({
    params: { slug: article.id },
    props: { article },
  }));
}

const { article } = Astro.props;
const { Content } = await render(article);
const ogImage = `/og/${article.id}.png`;
---

<Base title={article.data.title} description={article.data.description} ogImage={ogImage}>
  <article>
    <header class="mb-8">
      <time class="text-sm text-zinc-500 dark:text-zinc-400" datetime={article.data.pubDate.toISOString()}>
        {article.data.pubDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo' })}
      </time>
      <h1 class="mt-2 text-2xl font-bold leading-tight">{article.data.title}</h1>
      <div class="mt-3 flex flex-wrap gap-2">
        {article.data.tags.map((tag: string) => (
          <a href={`/tags/${tag}`} class="rounded-sm bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {tag}
          </a>
        ))}
      </div>
    </header>

    <AdSlot position="article-top" />

    <div class="prose prose-zinc dark:prose-invert max-w-none [&>h2:nth-of-type(2)~h2:first-of-type]:before:content-[''] article-body">
      <Content />
    </div>

    <AdSlot position="article-bottom" />
  </article>

  <RelatedArticles currentSlug={article.id} tags={article.data.tags} />

  <AdSlot position="footer" />
</Base>
```

- [ ] **Step 2: 記事本文の中間に広告を挿入するスクリプト追加**

記事本文内の2番目の `<h2>` の前に広告を挿入するため、クライアントサイドスクリプトを使用:

`src/pages/articles/[slug].astro` の `</Base>` の直前に追加:

```astro
<script>
  const body = document.querySelector('.article-body');
  if (body) {
    const headings = body.querySelectorAll('h2');
    if (headings.length >= 2) {
      const ad = document.createElement('div');
      ad.className = 'ad-slot my-6 flex items-center justify-center rounded bg-zinc-100 dark:bg-zinc-900';
      ad.dataset.adPosition = 'article-mid';
      ad.innerHTML = '<div class="px-4 py-8 text-center text-xs text-zinc-400 dark:text-zinc-600">広告スペース (article-mid)</div>';
      headings[1].before(ad);
    }
  }
</script>
```

- [ ] **Step 3: RelatedArticles.astro 作成**

```astro
---
// src/components/RelatedArticles.astro
import { getCollection } from 'astro:content';

interface Props {
  currentSlug: string;
  tags: string[];
  limit?: number;
}

const { currentSlug, tags, limit = 3 } = Astro.props;

const allArticles = await getCollection('articles');
const related = allArticles
  .filter((a) => a.id !== currentSlug)
  .map((a) => ({
    article: a,
    score: a.data.tags.filter((t: string) => tags.includes(t)).length,
  }))
  .filter((r) => r.score > 0)
  .sort((a, b) => b.score - a.score || b.article.data.pubDate.valueOf() - a.article.data.pubDate.valueOf())
  .slice(0, limit)
  .map((r) => r.article);
---

{related.length > 0 && (
  <aside class="mt-12 border-t border-zinc-200 pt-8 dark:border-zinc-800">
    <h2 class="mb-4 text-lg font-bold">関連記事</h2>
    <ul class="space-y-3">
      {related.map((a) => (
        <li>
          <a href={`/articles/${a.id}`} class="text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:decoration-zinc-700 dark:hover:text-zinc-100">
            {a.data.title}
          </a>
        </li>
      ))}
    </ul>
  </aside>
)}
```

- [ ] **Step 4: dev サーバーで確認**

```bash
npx astro dev
```

ブラウザで `http://localhost:4321/articles/2026-07-24-sample` を開き、以下を確認:
- 記事タイトル・日付・タグが表示される
- 広告スロット 3 箇所（article-top, article-mid, article-bottom）が表示される
- ダークモード（OS設定切り替え）で配色が変わる
- モバイル幅（375px）で崩れない

- [ ] **Step 5: コミット**

```bash
git add src/pages/articles/ src/components/RelatedArticles.astro
git commit -m "feat: add article detail page with ad slots and related articles"
```

---

### Task 4: Home Page + Article Cards + Pagination

**Files:**
- Create: `src/components/ArticleCard.astro`
- Create: `src/components/Pagination.astro`
- Create: `src/pages/[...page].astro`

**Interfaces:**
- Consumes: `Base.astro` layout, `AdSlot.astro`, Content Collections `articles`
- Produces: トップページ `/`（ページネーション付き）。`ArticleCard.astro`（props: `{ title: string, description: string, pubDate: Date, tags: string[], slug: string }`）。`Pagination.astro`（props: `{ currentPage: number, lastPage: number, basePath?: string }`）

- [ ] **Step 1: ArticleCard.astro 作成**

```astro
---
// src/components/ArticleCard.astro
interface Props {
  title: string;
  description: string;
  pubDate: Date;
  tags: string[];
  slug: string;
}

const { title, description, pubDate, tags, slug } = Astro.props;
---

<article class="py-5">
  <time class="text-xs text-zinc-500 dark:text-zinc-400" datetime={pubDate.toISOString()}>
    {pubDate.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo' })}
  </time>
  <h2 class="mt-1">
    <a href={`/articles/${slug}`} class="text-lg font-bold leading-snug text-zinc-900 hover:underline dark:text-zinc-100">
      {title}
    </a>
  </h2>
  <p class="mt-1 text-sm text-zinc-600 line-clamp-2 dark:text-zinc-400">{description}</p>
  <div class="mt-2 flex flex-wrap gap-1.5">
    {tags.map((tag) => (
      <a href={`/tags/${tag}`} class="rounded-sm bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        {tag}
      </a>
    ))}
  </div>
</article>
```

- [ ] **Step 2: Pagination.astro 作成**

```astro
---
// src/components/Pagination.astro
interface Props {
  currentPage: number;
  lastPage: number;
  basePath?: string;
}

const { currentPage, lastPage, basePath = '' } = Astro.props;

function pageUrl(page: number): string {
  if (page === 1) return basePath || '/';
  return `${basePath}/${page}`;
}
---

{lastPage > 1 && (
  <nav class="mt-12 flex items-center justify-center gap-4 text-sm">
    {currentPage > 1 ? (
      <a href={pageUrl(currentPage - 1)} class="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        &larr; 前のページ
      </a>
    ) : (
      <span class="text-zinc-300 dark:text-zinc-700">&larr; 前のページ</span>
    )}

    <span class="text-zinc-500 dark:text-zinc-400">
      {currentPage} / {lastPage}
    </span>

    {currentPage < lastPage ? (
      <a href={pageUrl(currentPage + 1)} class="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        次のページ &rarr;
      </a>
    ) : (
      <span class="text-zinc-300 dark:text-zinc-700">次のページ &rarr;</span>
    )}
  </nav>
)}
```

- [ ] **Step 3: トップページ作成**

```astro
---
// src/pages/[...page].astro
import type { GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import Base from '../layouts/Base.astro';
import ArticleCard from '../components/ArticleCard.astro';
import AdSlot from '../components/AdSlot.astro';
import Pagination from '../components/Pagination.astro';

export const getStaticPaths = (async ({ paginate }) => {
  const articles = await getCollection('articles');
  const sorted = articles.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );
  return paginate(sorted, { pageSize: 20 });
}) satisfies GetStaticPaths;

const { page } = Astro.props;
---

<Base title="最新の話題" description="ネットで話題のトレンドをまとめてお届け">
  <AdSlot position="header" />

  <div class="divide-y divide-zinc-100 dark:divide-zinc-800/50">
    {page.data.map((article, i) => (
      <>
        <ArticleCard
          title={article.data.title}
          description={article.data.description}
          pubDate={article.data.pubDate}
          tags={article.data.tags}
          slug={article.id}
        />
        {(i + 1) % 4 === 0 && <AdSlot position="feed" />}
      </>
    ))}
  </div>

  <Pagination currentPage={page.currentPage} lastPage={page.lastPage} />
</Base>
```

- [ ] **Step 4: dev サーバーで確認**

```bash
npx astro dev
```

ブラウザで `http://localhost:4321/` を開き確認:
- サンプル記事がカードとして表示される
- タグリンクが機能する
- モバイル幅で崩れない
- カードをクリックして記事ページに遷移する

- [ ] **Step 5: コミット**

```bash
git add src/components/ArticleCard.astro src/components/Pagination.astro src/pages/\[...page\].astro
git commit -m "feat: add home page with article cards and pagination"
```

---

### Task 5: Tag Page

**Files:**
- Create: `src/pages/tags/[tag]/[...page].astro`

**Interfaces:**
- Consumes: `Base.astro`, `ArticleCard.astro`, `AdSlot.astro`, `Pagination.astro`, Content Collections `articles`
- Produces: タグ別一覧ページ `/tags/[tag]`（ページネーション付き）

- [ ] **Step 1: タグページ作成**

```astro
---
// src/pages/tags/[tag]/[...page].astro
import type { GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import Base from '../../../layouts/Base.astro';
import ArticleCard from '../../../components/ArticleCard.astro';
import AdSlot from '../../../components/AdSlot.astro';
import Pagination from '../../../components/Pagination.astro';

export const getStaticPaths = (async ({ paginate }) => {
  const articles = await getCollection('articles');
  const tags = [...new Set(articles.flatMap((a) => a.data.tags))];

  return tags.flatMap((tag) => {
    const filtered = articles
      .filter((a) => a.data.tags.includes(tag))
      .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
    return paginate(filtered, {
      params: { tag },
      pageSize: 20,
    });
  });
}) satisfies GetStaticPaths;

const { tag } = Astro.params;
const { page } = Astro.props;
---

<Base title={`「${tag}」の記事一覧`} description={`${tag}に関する話題まとめ記事の一覧`}>
  <h1 class="mb-6 text-xl font-bold">「{tag}」の記事</h1>

  <AdSlot position="header" />

  <div class="divide-y divide-zinc-100 dark:divide-zinc-800/50">
    {page.data.map((article, i) => (
      <>
        <ArticleCard
          title={article.data.title}
          description={article.data.description}
          pubDate={article.data.pubDate}
          tags={article.data.tags}
          slug={article.id}
        />
        {(i + 1) % 4 === 0 && <AdSlot position="feed" />}
      </>
    ))}
  </div>

  <Pagination currentPage={page.currentPage} lastPage={page.lastPage} basePath={`/tags/${tag}`} />
</Base>
```

- [ ] **Step 2: dev サーバーで確認**

```bash
npx astro dev
```

`http://localhost:4321/tags/テスト` を開き、サンプル記事がフィルタされて表示されることを確認。

- [ ] **Step 3: コミット**

```bash
git add src/pages/tags/
git commit -m "feat: add tag-filtered article listing page"
```

---

### Task 6: OGP Image Generation

**Files:**
- Create: `src/pages/og/[slug].png.ts`

**Interfaces:**
- Consumes: Content Collections `articles`
- Produces: 各記事の OGP 画像 `/og/[slug].png`（1200x630 PNG）

- [ ] **Step 1: satori と sharp をインストール**

```bash
npm install satori sharp
```

- [ ] **Step 2: OGP 画像エンドポイント作成**

```ts
// src/pages/og/[slug].png.ts
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import satori from 'satori';
import sharp from 'sharp';

export const getStaticPaths: GetStaticPaths = async () => {
  const articles = await getCollection('articles');
  return articles.map((article) => ({
    params: { slug: article.id },
    props: { title: article.data.title },
  }));
};

let fontData: ArrayBuffer | null = null;

async function loadFont(): Promise<ArrayBuffer> {
  if (fontData) return fontData;
  const res = await fetch(
    'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-jp@latest/japanese-700-normal.woff'
  );
  fontData = await res.arrayBuffer();
  return fontData;
}

export const GET: APIRoute = async ({ props }) => {
  const { title } = props as { title: string };
  const font = await loadFont();

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px',
          backgroundColor: '#18181b',
          color: '#fafafa',
          fontFamily: 'Noto Sans JP',
        },
        children: [
          {
            type: 'div',
            props: {
              style: { fontSize: 48, fontWeight: 700, lineHeight: 1.4, wordBreak: 'break-word' },
              children: title,
            },
          },
          {
            type: 'div',
            props: {
              style: { fontSize: 24, color: '#a1a1aa', marginTop: 'auto' },
              children: '話題まとめ',
            },
          },
        ],
      },
    },
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Noto Sans JP',
          data: font,
          weight: 700,
          style: 'normal',
        },
      ],
    }
  );

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  return new Response(png, {
    headers: { 'Content-Type': 'image/png' },
  });
};
```

- [ ] **Step 3: ビルドして OGP 画像生成を確認**

```bash
npx astro build
ls dist/og/
```

Expected: `2026-07-24-sample.png` が生成される

- [ ] **Step 4: コミット**

```bash
git add src/pages/og/
git commit -m "feat: add OGP image generation with satori and sharp"
```

---

### Task 7: Content Generation Script + Tests

**Files:**
- Create: `scripts/trends.ts`
- Create: `scripts/dedup.ts`
- Create: `scripts/article.ts`
- Create: `scripts/markdown.ts`
- Create: `scripts/generate.ts`
- Create: `scripts/__tests__/trends.test.ts`
- Create: `scripts/__tests__/dedup.test.ts`
- Create: `scripts/__tests__/markdown.test.ts`
- Modify: `package.json`（scripts に `generate` と `test` を追加）

**Interfaces:**
- Consumes: Google Trends RSS, Gemini API (`GEMINI_API_KEY` 環境変数)
- Produces: `src/content/articles/*.md` に記事ファイルを書き出し

- [ ] **Step 1: テスト設定を package.json に追加**

`package.json` の `scripts` に追加:

```json
{
  "scripts": {
    "generate": "tsx scripts/generate.ts",
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: trends.ts の failing test を書く**

```ts
// scripts/__tests__/trends.test.ts
import { describe, it, expect, vi } from 'vitest';
import { parseTrendsXml, type TrendItem } from '../trends';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:ht="https://trends.google.co.jp/trends/trendingsearches/daily" version="2.0">
  <channel>
    <item>
      <title>テストキーワード</title>
      <ht:approx_traffic>100,000+</ht:approx_traffic>
      <ht:news_item>
        <ht:news_item_title>関連ニュース1</ht:news_item_title>
        <ht:news_item_url>https://example.com/news1</ht:news_item_url>
      </ht:news_item>
    </item>
    <item>
      <title>もう一つのキーワード</title>
      <ht:approx_traffic>50,000+</ht:approx_traffic>
    </item>
  </channel>
</rss>`;

describe('parseTrendsXml', () => {
  it('should parse RSS XML into TrendItem array sorted by traffic', () => {
    const items = parseTrendsXml(SAMPLE_RSS);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('テストキーワード');
    expect(items[0].traffic).toBe(100000);
    expect(items[0].newsItems).toHaveLength(1);
    expect(items[0].newsItems[0].title).toBe('関連ニュース1');
    expect(items[1].title).toBe('もう一つのキーワード');
    expect(items[1].traffic).toBe(50000);
    expect(items[1].newsItems).toHaveLength(0);
  });
});
```

- [ ] **Step 3: テストが fail することを確認**

```bash
npx vitest run scripts/__tests__/trends.test.ts
```

Expected: FAIL（`parseTrendsXml` が存在しない）

- [ ] **Step 4: trends.ts を実装**

```ts
// scripts/trends.ts
import { XMLParser } from 'fast-xml-parser';

export interface TrendItem {
  title: string;
  traffic: number;
  newsItems: { title: string; url: string }[];
}

export function parseTrendsXml(xml: string): TrendItem[] {
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);

  const channel = parsed?.rss?.channel;
  if (!channel?.item) return [];

  const items = Array.isArray(channel.item) ? channel.item : [channel.item];

  return items
    .map((item: any) => ({
      title: item.title ?? '',
      traffic: parseTraffic(item['ht:approx_traffic'] ?? '0'),
      newsItems: parseNewsItems(item['ht:news_item']),
    }))
    .sort((a: TrendItem, b: TrendItem) => b.traffic - a.traffic);
}

function parseTraffic(raw: string): number {
  return parseInt(String(raw).replace(/[^0-9]/g, ''), 10) || 0;
}

function parseNewsItems(raw: any): { title: string; url: string }[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((n: any) => ({
    title: n['ht:news_item_title'] ?? '',
    url: n['ht:news_item_url'] ?? '',
  }));
}

export async function fetchTrends(): Promise<TrendItem[]> {
  const res = await fetch('https://trends.google.co.jp/trending/rss?geo=JP');
  const xml = await res.text();
  return parseTrendsXml(xml);
}
```

- [ ] **Step 5: テストが pass することを確認**

```bash
npx vitest run scripts/__tests__/trends.test.ts
```

Expected: PASS

- [ ] **Step 6: dedup.ts の failing test を書く**

```ts
// scripts/__tests__/dedup.test.ts
import { describe, it, expect } from 'vitest';
import { filterNewTrends, type ExistingArticle } from '../dedup';
import type { TrendItem } from '../trends';

describe('filterNewTrends', () => {
  const trends: TrendItem[] = [
    { title: '新しい話題', traffic: 100000, newsItems: [] },
    { title: '既存の話題', traffic: 50000, newsItems: [] },
    { title: '古い話題', traffic: 30000, newsItems: [] },
  ];

  it('should filter out trends that already have recent articles', () => {
    const existing: ExistingArticle[] = [
      { keyword: '既存の話題', pubDate: new Date() },
    ];
    const result = filterNewTrends(trends, existing);
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.title)).toEqual(['新しい話題', '古い話題']);
  });

  it('should not filter out old articles (>24h)', () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const existing: ExistingArticle[] = [
      { keyword: '既存の話題', pubDate: oldDate },
    ];
    const result = filterNewTrends(trends, existing);
    expect(result).toHaveLength(3);
  });
});
```

- [ ] **Step 7: テストが fail → dedup.ts を実装 → pass を確認**

```ts
// scripts/dedup.ts
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
```

```bash
npx vitest run scripts/__tests__/dedup.test.ts
```

Expected: PASS

- [ ] **Step 8: markdown.ts の failing test を書く**

```ts
// scripts/__tests__/markdown.test.ts
import { describe, it, expect } from 'vitest';
import { toSlug, toMarkdown } from '../markdown';
import type { GeneratedArticle } from '../article';

describe('toSlug', () => {
  it('should create a date-prefixed slug from keyword', () => {
    const date = new Date('2026-07-24T15:00:00+09:00');
    const slug = toSlug('テストキーワード', date);
    expect(slug).toBe('2026-07-24-テストキーワード');
  });

  it('should replace spaces and special chars with hyphens', () => {
    const date = new Date('2026-07-24T00:00:00Z');
    const slug = toSlug('hello world!', date);
    expect(slug).toBe('2026-07-24-hello-world');
  });
});

describe('toMarkdown', () => {
  it('should produce valid frontmatter + body', () => {
    const article: GeneratedArticle = {
      title: 'テスト記事',
      description: 'テスト説明',
      body: '## 見出し\n\n本文',
      tags: ['タグ1', 'タグ2'],
      trendKeyword: 'テスト',
      trafficVolume: 10000,
      pubDate: '2026-07-24T15:00:00+09:00',
    };
    const md = toMarkdown(article);
    expect(md).toContain('title: "テスト記事"');
    expect(md).toContain('tags: ["タグ1","タグ2"]');
    expect(md).toContain('## 見出し');
    expect(md).toMatch(/^---\n/);
  });

  it('should escape double quotes in title', () => {
    const article: GeneratedArticle = {
      title: '「引用」テスト',
      description: 'desc',
      body: 'body',
      tags: [],
      trendKeyword: 'kw',
      trafficVolume: 0,
      pubDate: '2026-07-24T15:00:00+09:00',
    };
    const md = toMarkdown(article);
    expect(md).not.toContain('title: "「引用」テスト"');
  });
});
```

- [ ] **Step 9: テストが fail → markdown.ts を実装 → pass を確認**

```ts
// scripts/markdown.ts
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { GeneratedArticle } from './article';

export function toSlug(keyword: string, date: Date): string {
  const dateStr = date.toISOString().slice(0, 10);
  const slug = keyword
    .replace(/[\s　]+/g, '-')
    .replace(/[^\w　-鿿゠-ヿ぀-ゟ＀-￯-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${dateStr}-${slug}`;
}

export function toMarkdown(article: GeneratedArticle): string {
  const escapedTitle = article.title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escapedDesc = article.description.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escapedKeyword = article.trendKeyword.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const tags = JSON.stringify(article.tags);

  return `---
title: "${escapedTitle}"
description: "${escapedDesc}"
pubDate: ${article.pubDate}
tags: ${tags}
trendKeyword: "${escapedKeyword}"
trafficVolume: ${article.trafficVolume}
---

${article.body}
`;
}

export async function writeArticle(article: GeneratedArticle, dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const slug = toSlug(article.trendKeyword, new Date(article.pubDate));
  const filePath = join(dir, `${slug}.md`);
  await writeFile(filePath, toMarkdown(article), 'utf-8');
  return filePath;
}
```

```bash
npx vitest run scripts/__tests__/markdown.test.ts
```

Expected: PASS

- [ ] **Step 10: article.ts を実装**

```ts
// scripts/article.ts
import { GoogleGenAI } from '@google/genai';
import type { TrendItem } from './trends';

export interface GeneratedArticle {
  title: string;
  description: string;
  body: string;
  tags: string[];
  trendKeyword: string;
  trafficVolume: number;
  pubDate: string;
}

export async function generateArticle(trend: TrendItem): Promise<GeneratedArticle> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const newsContext = trend.newsItems
    .map((n) => `- ${n.title} (${n.url})`)
    .join('\n');

  const prompt = `あなたはトレンドニュースのキュレーターです。以下のトレンドキーワードについて、日本語で記事を書いてください。

キーワード: ${trend.title}
${newsContext ? `関連ニュース:\n${newsContext}` : ''}

以下のJSON形式で出力してください。他のテキストは出力しないでください:
{
  "title": "キャッチーなタイトル（30〜40文字）",
  "description": "OGP用の説明文（120文字以内）",
  "tags": ["タグ1", "タグ2", "タグ3"],
  "body": "## セクション1\\n\\n本文...\\n\\n## セクション2\\n\\n本文...\\n\\n## まとめ\\n\\nまとめ..."
}

注意:
- 各セクションは200〜300文字
- 「ネットの反応」や「まとめ」セクションを含める
- タグは3〜5個
- bodyはMarkdown形式`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
    },
  });

  const text = response.text ?? '';
  const parsed = JSON.parse(text);

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const pubDate = jst.toISOString().replace('Z', '+09:00');

  return {
    title: parsed.title,
    description: parsed.description,
    body: parsed.body,
    tags: parsed.tags,
    trendKeyword: trend.title,
    trafficVolume: trend.traffic,
    pubDate,
  };
}
```

- [ ] **Step 11: generate.ts メインスクリプトを実装**

```ts
// scripts/generate.ts
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
```

- [ ] **Step 12: 全テスト実行**

```bash
npx vitest run
```

Expected: 全テスト PASS

- [ ] **Step 13: コミット**

```bash
git add scripts/ package.json
git commit -m "feat: add content generation pipeline with tests

Fetches Google Trends RSS, deduplicates against existing articles,
generates new articles via Gemini API, and writes Markdown files."
```

---

### Task 8: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/generate.yml`

**Interfaces:**
- Consumes: `npm run generate` スクリプト, GitHub Secrets (`GEMINI_API_KEY`)
- Produces: 毎時 cron で記事生成 → commit & push

- [ ] **Step 1: ワークフローファイル作成**

```yaml
# .github/workflows/generate.yml
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

      - run: npm ci

      - name: Generate articles
        run: npm run generate
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}

      - name: Commit and push if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add src/content/articles/
          git diff --staged --quiet && echo "No new articles" && exit 0
          git commit -m "chore: auto-generate trending articles $(date -u +%Y-%m-%dT%H:%M:%SZ)"
          git push
```

- [ ] **Step 2: .gitignore にビルド成果物を追加**

```
# .gitignore に以下を追記
dist/
node_modules/
.astro/
```

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/generate.yml .gitignore
git commit -m "feat: add GitHub Actions cron workflow for article generation"
```

---

## Post-Implementation Checklist

以下はユーザーが手動で行う必要がある設定:

1. **GitHub リポジトリ作成 & push**: `git remote add origin <url> && git push -u origin main`
2. **GitHub Secrets 設定**: リポジトリの Settings → Secrets → `GEMINI_API_KEY` を追加
3. **Cloudflare Pages 設定**: Cloudflare ダッシュボードで Git 連携を設定
   - Build command: `npm run build`
   - Build output directory: `dist`
4. **カスタムドメイン設定**: Cloudflare でドメイン取得 → Pages プロジェクトに紐付け
5. **`astro.config.mjs` の `site` を実際のドメインに変更**
6. **サンプル記事の削除**: `src/content/articles/2026-07-24-sample.md` を削除

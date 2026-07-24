# 話題まとめサイト 設計書

## 概要

Google Trends から日本のトレンドキーワードを自動取得し、Gemini API で記事を生成して静的サイトとして配信するトレンドキュレーションサイト。SNS（X/Twitter）からの流入をメインとし、広告で収益化する。

## 要件

- **ジャンル**: 雑多（制限なし）
- **生成頻度**: 毎時 3〜5 記事（GitHub Actions cron）
- **トレンド収集元**: Google Trends RSS（日本）
- **AI モデル**: Gemini 2.5 Flash Lite（Google Search grounding 有効）
- **流入経路**: X/Twitter でのツイート宣伝（SEO 非依存）
- **広告**: 未定 → 差し替え可能なスロットコンポーネントで対応

## アーキテクチャ

```
Google Trends RSS (JP)
        │
        ▼
GitHub Actions (cron: 毎時)
        │
        ├─ 1. トレンドキーワード取得
        ├─ 2. 既存記事と重複チェック
        ├─ 3. Gemini API で記事生成（3〜5件）
        ├─ 4. Markdown ファイルとして保存
        ├─ 5. git commit & push
        │
        ▼
Cloudflare Pages（Git 連携で自動ビルド）
        │
        ├─ Astro ビルド（静的 HTML 生成）
        │
        ▼
Cloudflare CDN（エッジキャッシュ配信）
```

- DB 不要。記事は Markdown ファイルとして git リポジトリに保存（Astro Content Collections）
- GitHub push → Cloudflare Pages の Git 連携で自動ビルド・デプロイ
- GitHub Actions はコンテンツ生成 + push のみ。デプロイ用 workflow は作らない

## コンテンツ生成パイプライン

### トレンド取得

- Google Trends 日本向け RSS フィード（`https://trends.google.co.jp/trending/rss?geo=JP`）を取得
- XML パースしてキーワード一覧を抽出（タイトル・トラフィック量・関連ニュース URL）

### 重複排除

- 既存の記事ファイル名（slug）とキーワードの frontmatter を照合
- 過去 24 時間以内に同じキーワードで生成済みなら skip
- トラフィック量が多い順にソートし、上位 3〜5 件を選出

### 記事生成

- **モデル**: Gemini 2.5 Flash Lite
- **Google Search grounding**: 有効（最新情報を検索してから記事を書かせる）
- **出力構造**:
  - タイトル（30〜40 文字、キャッチーに）
  - リード文（2〜3 文）
  - 本文（3〜4 セクション、各 200〜300 文字）
  - まとめ / ネットの反応
  - OGP 用 description（120 文字以内）
  - タグ（3〜5 個）

### 出力形式

Astro Content Collections 用の Markdown + frontmatter:

```markdown
---
title: "〇〇が話題に！ネットの反応まとめ"
description: "OGP用の短い説明文"
pubDate: 2026-07-24T15:00:00+09:00
tags: ["エンタメ", "芸能"]
trendKeyword: "元のトレンドキーワード"
trafficVolume: 50000
---

本文...
```

### コスト見積もり

- Gemini 2.5 Flash Lite: 入力 $0.075/100 万トークン、出力 $0.3/100 万トークン
- 1 記事あたり約 2000 トークン（入出力合計）→ 1 日 120 記事で約 $0.05/日
- **月額 $1.5 程度**

## ページ構成

| ページ | パス | 内容 |
|--------|------|------|
| トップ | `/` | 最新記事一覧（20件/ページ、ページネーション） |
| 記事詳細 | `/articles/[slug]` | 個別記事ページ |
| タグ別一覧 | `/tags/[tag]` | タグで絞り込んだ記事一覧 |

## 広告スロット配置

記事ページに 4 箇所の広告スロットを配置:

1. **ヘッダー広告**（728x90）: ページ上部
2. **記事内上部**: リード文の下
3. **記事内中部**: 本文セクション 2 と 3 の間
4. **記事末尾**: まとめセクションの下

一覧ページでは記事カード 3〜4 件ごとに広告を挿入。

広告は `<AdSlot position="header" />` コンポーネントで管理し、広告ネットワーク決定後にコンポーネント内のコードを差し替えるだけで全ページに反映。

## OGP / Twitter Card

SNS 流入がメインのため最重要:

- `twitter:card` = `summary_large_image`
- OGP 画像: 記事タイトルをテキスト描画した画像をビルド時に `satori` + `sharp` で生成
- 全記事に `og:title`, `og:description`, `og:image` を設定

## デザイン方針

- モバイルファースト（X からの流入はほぼスマホ）
- 読み込み速度重視（静的 HTML）
- 余白・フォントサイズを十分取ってスマホで読みやすく
- ダークモード対応
- AI 生成テンプレ感を避けた控えめなデザイン

## プロジェクト構造

```
wadaimatome/
├── src/
│   ├── content/
│   │   └── articles/          # 生成された記事 Markdown
│   ├── components/
│   │   ├── AdSlot.astro       # 広告スロット
│   │   ├── ArticleCard.astro  # 一覧用カード
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── OgImage.astro      # OGP画像生成
│   │   └── RelatedArticles.astro
│   ├── layouts/
│   │   └── Base.astro         # 共通レイアウト
│   ├── pages/
│   │   ├── index.astro        # トップ
│   │   ├── articles/[slug].astro
│   │   └── tags/[tag].astro
│   └── styles/
│       └── global.css
├── scripts/
│   └── generate.ts            # 記事生成スクリプト
├── .github/
│   └── workflows/
│       └── generate.yml       # cron ワークフロー
├── astro.config.mjs
├── tailwind.config.mjs
├── package.json
└── wrangler.toml
```

## 依存関係

| 用途 | パッケージ |
|------|-----------|
| フレームワーク | `astro` |
| Cloudflare 連携 | `@astrojs/cloudflare` |
| スタイリング | `@astrojs/tailwind`, `tailwindcss` |
| 記事生成 AI | `@google/genai` |
| RSS パース | `fast-xml-parser` |
| OGP 画像生成 | `satori`, `sharp` |

## Cloudflare 設定

- Cloudflare Pages（Git 連携でデプロイ）
- エッジキャッシュ: 静的アセットは自動キャッシュ
- カスタムドメインは Cloudflare で取得・管理

## GitHub Actions ワークフロー

- `generate.yml`: cron で毎時実行
- Node.js セットアップ → `npm run generate` → 変更があれば commit & push
- push をトリガーに Cloudflare Pages が自動ビルド・デプロイ
- Gemini API キーは GitHub Secrets に格納（`GEMINI_API_KEY`）

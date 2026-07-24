# Discord 通知 + ドラフト2段階ワークフロー 設計書

## 目的

記事生成パイプラインに Discord 通知を組み込み、ユーザーが公開前に参考ツイートを追加できる窓を設ける。応答がなければ自動公開し、公開後に宣伝ツイート案を通知する。

## アーキテクチャ

2段階の GitHub Actions ワークフローで実現する。

- **generate.yml**（毎時 :00）: 記事を `draft: true` で生成・commit・push → Discord に生成通知
- **publish.yml**（毎時 :30）: `draft: true` の記事を公開（フラグ削除）→ Discord に公開通知 + 宣伝ツイート案

Discord Webhook は送信専用。ユーザーの応答は GitHub Web UI でのファイル編集で行う。

## コンポーネント

### 1. scripts/notify.ts

Discord Webhook へ通知を送信するモジュール。

```ts
interface NotifyOptions {
  webhookUrl: string;
  content: string;
  embeds?: DiscordEmbed[];
}

interface DiscordEmbed {
  title: string;
  description: string;
  url?: string;
  color?: number;
  thumbnail?: { url: string };
}

export async function sendDiscordNotification(options: NotifyOptions): Promise<void>
```

- Webhook URL は環境変数 `DISCORD_WEBHOOK_URL` から取得
- HTTP POST で JSON を送信
- 失敗時はエラーログを出すが、記事生成・公開自体はブロックしない

### 2. scripts/generate.ts の変更

記事生成後に Discord 通知を送信する。

- `GeneratedArticle` に `draft: true` を既定で付与（`writeArticle` に渡す）
- 全記事生成後、`sendDiscordNotification` で生成通知を送信
- 通知内容: 記事タイトル一覧 + GitHub 編集リンク + 「30分後に自動公開」の案内

### 3. scripts/markdown.ts の変更

- `toMarkdown()`: `draft` フィールドをフロントマターに出力
- フロントマター形式: `draft: true`

### 4. scripts/publish.ts（新規）

ドラフト記事を公開するスクリプト。

1. `src/content/articles/` 内の全 `.md` ファイルをスキャン
2. フロントマターに `draft: true` があるファイルを検出
3. `draft: true` 行を削除
4. 変更があったファイルを書き戻し
5. Discord に公開通知を送信
   - 記事タイトル + 公開 URL
   - 宣伝ツイート案（テンプレート生成）

### 5. src/content.config.ts の変更

```ts
schema: z.object({
  // ...existing fields...
  draft: z.boolean().optional(),
})
```

### 6. 全ページの draft フィルタ

`getCollection('articles')` の全呼び出しで `draft !== true` をフィルタする。

対象ファイル:
- `src/pages/[...page].astro`
- `src/pages/articles/[slug].astro`
- `src/pages/tags/[tag]/[...page].astro`
- `src/pages/og/[slug].png.ts`
- `src/components/RelatedArticles.astro`

フィルタ方法:
```ts
const articles = await getCollection('articles', ({ data }) => data.draft !== true);
```

### 7. .github/workflows/generate.yml の変更

`DISCORD_WEBHOOK_URL` シークレットを環境変数として渡す。

```yaml
- name: Generate articles
  run: npm run generate
  env:
    GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
    DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

### 8. .github/workflows/publish.yml（新規）

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
      - name: Commit and push
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add src/content/articles/
          git diff --staged --quiet && echo "No drafts to publish" && exit 0
          git commit -m "chore: publish draft articles"
          git push
```

## 通知フォーマット

### 生成通知（Discord Embed）

- **色**: `0x3b82f6`（青）
- **タイトル**: `📝 新しい記事を生成しました（N件）`
- **本文**: 各記事のタイトル + GitHub 編集リンク（`https://github.com/Shichimi555/wadaimatome/edit/main/src/content/articles/{slug}.md`）
- **フッター**: `⏰ 30分後に自動公開されます`

### 公開通知（Discord Embed）

- **色**: `0x22c55e`（緑）
- **タイトル**: `🚀 記事を公開しました（N件）`
- **本文**: 各記事のタイトル + 公開URL + 宣伝ツイート案

### 宣伝ツイート案テンプレート

```
{description}
{articleUrl}
#{tag1} #{tag2} #話題まとめ
```

## シークレット

| 名前 | 用途 |
|---|---|
| `DISCORD_WEBHOOK_URL` | Discord Webhook の URL |
| `GEMINI_API_KEY` | 既存 |

## package.json scripts 追加

```json
{
  "publish-drafts": "tsx scripts/publish.ts"
}
```

## エラーハンドリング

- Discord 通知の失敗は記事生成・公開をブロックしない（try/catch でログのみ）
- publish.ts でドラフトが0件の場合は何もせず正常終了
- Webhook URL が未設定の場合は通知をスキップ

## テスト

- `scripts/__tests__/notify.test.ts`: Discord 通知のペイロード構築テスト（fetch をモック）
- `scripts/__tests__/publish.test.ts`: ドラフトフラグ削除のテスト（ファイル I/O をモック）

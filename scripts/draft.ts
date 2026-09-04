import type { TrendItem } from './trends';
import { extractJson } from './extract-json';

/** What every engine has to produce before the shared post-processing runs. */
export interface ArticleDraft {
  title: string;
  description: string;
  body: string;
  tags: string[];
}

/** The half of the prompt that must not drift between engines. */
const OUTPUT_SPEC = `以下のJSON形式で出力してください。他のテキストは出力しないでください:
{
  "title": "キャッチーなタイトル（30〜40文字）",
  "description": "OGP用の説明文（120文字以内）",
  "tags": ["タグ1", "タグ2", "タグ3"],
  "body": "## セクション1\\n\\n本文...\\n\\n## セクション2\\n\\n本文...\\n\\n## まとめ\\n\\nまとめ..."
}

注意:
- 各セクションは200〜300文字
- 「まとめ」セクションを含める
- 「ネットの反応」セクションは書かないこと（実際のSNS投稿を後から自動で差し込むため）
- SNSの投稿内容を創作・引用しないこと
- タグは3〜5個
- bodyはMarkdown形式`;

const INTRO = 'あなたはトレンドニュースのキュレーターです。以下のトレンドキーワードについて、日本語で記事を書いてください。';

/**
 * For a model that can search the web itself. Headlines are a starting point;
 * the model is expected to go and find the detail.
 */
export function buildGroundedPrompt(trend: TrendItem): string {
  const headlines = trend.newsItems.map((n) => `- ${n.title} (${n.url})`).join('\n');
  return `${INTRO}

キーワード: ${trend.title}
${headlines ? `関連ニュース:\n${headlines}` : ''}

${OUTPUT_SPEC}`;
}

/**
 * For a model that cannot search. Everything it is allowed to state has to be in
 * the text we hand it, so the instruction against inventing detail is explicit.
 */
export function buildSourcedPrompt(trend: TrendItem, sources: string): string {
  return `${INTRO}

キーワード: ${trend.title}

${
  sources
    ? `参考資料（実際のニュース記事からの抜粋）:\n${sources}\n\n参考資料に書かれていない事実を創作しないこと。資料が薄い場合は、断定を避けて分かっていることだけを書くこと。`
    : '参考資料は取得できませんでした。キーワードから確実に言えること以外は書かないこと。'
}

${OUTPUT_SPEC}`;
}

/**
 * Turns a model response into a draft, or explains why it could not.
 * `context` names the engine and whatever diagnostics it has, so a failure
 * notification says which side broke.
 */
export function parseDraft(text: string, context: string): ArticleDraft {
  const json = extractJson(text);
  if (!json) {
    // Either the model answered in prose instead of JSON, or the object stops
    // mid-body and never closes.
    throw new Error(`No JSON found in ${context} (${text.length} chars): ${text.slice(0, 200)}`);
  }

  const parsed = JSON.parse(json);
  if (
    typeof parsed.title !== 'string' ||
    typeof parsed.description !== 'string' ||
    typeof parsed.body !== 'string' ||
    !Array.isArray(parsed.tags)
  ) {
    throw new Error(`Invalid response shape from ${context}: ${Object.keys(parsed).join(', ')}`);
  }

  return {
    title: parsed.title,
    description: parsed.description,
    body: parsed.body,
    tags: parsed.tags.map(String),
  };
}

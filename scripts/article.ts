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

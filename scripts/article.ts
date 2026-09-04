import { GoogleGenAI } from '@google/genai';
import type { TrendItem } from './trends';
import { fetchOgImage } from './ogimage';
import { fetchTweets, formatTweetsHtml } from './tweets';
import { withRetry } from './retry';

export interface GeneratedArticle {
  title: string;
  description: string;
  body: string;
  tags: string[];
  trendKeyword: string;
  trafficVolume: number;
  pubDate: string;
  heroImage: string;
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
- 「まとめ」セクションを含める
- 「ネットの反応」セクションは書かないこと（実際のSNS投稿を後から自動で差し込むため）
- SNSの投稿内容を創作・引用しないこと
- タグは3〜5個
- bodyはMarkdown形式`;

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash-lite',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      }),
    {
      onRetry: (err, attempt, delayMs) =>
        console.warn(
          `Gemini call failed (attempt ${attempt}), retrying in ${delayMs}ms:`,
          err instanceof Error ? err.message.split('\n')[0] : err
        ),
    }
  );

  const text = response.text ?? '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Usually the response is valid JSON that stops mid-body, so there is no
    // closing brace to match. finishReason says whether the model ran out of
    // output budget or was cut off for another reason.
    const finishReason = response.candidates?.[0]?.finishReason ?? 'unknown';
    throw new Error(
      `No JSON found in Gemini response (finishReason=${finishReason}, ${text.length} chars): ${text.slice(0, 200)}`
    );
  }
  const parsed = JSON.parse(jsonMatch[0]);

  if (
    typeof parsed.title !== 'string' ||
    typeof parsed.description !== 'string' ||
    typeof parsed.body !== 'string' ||
    !Array.isArray(parsed.tags)
  ) {
    throw new Error(`Invalid response shape from Gemini: ${Object.keys(parsed).join(', ')}`);
  }

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const pubDate = jst.toISOString().replace('Z', '+09:00');

  let heroImage = '';
  for (const news of trend.newsItems) {
    if (news.url) {
      heroImage = await fetchOgImage(news.url);
      if (heroImage) break;
    }
  }
  if (!heroImage) {
    heroImage =
      trend.picture ||
      trend.newsItems.find((n) => n.picture)?.picture ||
      '';
  }

  // Always drop any "ネットの反応" the model wrote: its quotes are invented.
  // Real tweets are appended below when we manage to fetch them.
  let body: string = parsed.body.replace(/## ネットの反応[\s\S]*?(?=## |$)/, '').trimEnd();

  const tweets = await fetchTweets(trend.title);
  if (tweets.length > 0) {
    body = body + '\n\n' + formatTweetsHtml(tweets);
  } else {
    console.warn(`No tweets found for "${trend.title}"`);
  }

  return {
    title: parsed.title,
    description: parsed.description,
    body,
    tags: parsed.tags,
    trendKeyword: trend.title,
    trafficVolume: trend.traffic,
    pubDate,
    heroImage,
  };
}

import { XMLParser } from 'fast-xml-parser';

export interface TrendItem {
  title: string;
  traffic: number;
  picture: string;
  newsItems: { title: string; url: string; picture: string }[];
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
      picture: String(item['ht:picture'] ?? '').trim(),
      newsItems: parseNewsItems(item['ht:news_item']),
    }))
    .sort((a: TrendItem, b: TrendItem) => b.traffic - a.traffic);
}

function parseTraffic(raw: string): number {
  return parseInt(String(raw).replace(/[^0-9]/g, ''), 10) || 0;
}

function parseNewsItems(raw: any): { title: string; url: string; picture: string }[] {
  if (!raw) return [];
  const items = Array.isArray(raw) ? raw : [raw];
  return items.map((n: any) => ({
    title: n['ht:news_item_title'] ?? '',
    url: n['ht:news_item_url'] ?? '',
    picture: String(n['ht:news_item_picture'] ?? '').trim(),
  }));
}

/**
 * Keywords that mark a trend as breaking / high public interest. Google Trends
 * only gives us search volume, which over-rewards celebrity chatter, so we
 * weight these categories up when picking which trends become articles.
 */
export const BREAKING_CATEGORIES: { weight: number; words: string[] }[] = [
  {
    // 気象・災害
    weight: 3,
    words: [
      'ゲリラ豪雨', '豪雨', '大雨', '洪水', '冠水', '浸水', '土砂災害', '土砂崩れ',
      '地震', '震度', '津波', '噴火', '台風', '竜巻', '落雷', '大雪', '暴風',
      '警報', '避難指示', '避難勧告', '熱中症', '停電', '断水', '猛暑日',
    ],
  },
  {
    // 事件・事故
    weight: 3,
    words: [
      '人身事故', '事故', '衝突', '火災', '火事', '爆発', '逮捕', '殺人', '傷害',
      '刺され', '搬送', '死亡', '死去', '訃報', '不審者', '立てこもり', '誘拐',
      '行方不明', 'リコール', '速報', '緊急',
    ],
  },
  {
    // 交通・インフラの乱れ
    weight: 2,
    words: ['運転見合わせ', '運休', '遅延', '通行止め', '欠航', '運転再開', '規制'],
  },
];

/** Highest matching category weight for a blob of text (1 when nothing matches). */
export function breakingWeightOfText(haystack: string): number {
  let weight = 1;
  for (const category of BREAKING_CATEGORIES) {
    if (category.weight > weight && category.words.some((w) => haystack.includes(w))) {
      weight = category.weight;
    }
  }
  return weight;
}

/**
 * Highest matching category weight for a trend (1 when nothing matches).
 * Matches the keyword itself and the headlines attached to it.
 */
export function breakingWeight(trend: TrendItem): number {
  return breakingWeightOfText(
    [trend.title, ...trend.newsItems.map((n) => n.title)].join(' ')
  );
}

/** Orders trends by breaking-news-weighted traffic, highest first. */
export function rankTrends(trends: TrendItem[]): TrendItem[] {
  return [...trends].sort(
    (a, b) => breakingWeight(b) * b.traffic - breakingWeight(a) * a.traffic
  );
}

export async function fetchTrends(): Promise<TrendItem[]> {
  const res = await fetch('https://trends.google.co.jp/trending/rss?geo=JP');
  const xml = await res.text();
  return parseTrendsXml(xml);
}

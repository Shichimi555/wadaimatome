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

import { describe, it, expect } from 'vitest';
import { parseTrendsXml, breakingWeight, rankTrends, type TrendItem } from '../trends';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:ht="https://trends.google.co.jp/trends/trendingsearches/daily" version="2.0">
  <channel>
    <item>
      <title>テストキーワード</title>
      <ht:approx_traffic>100,000+</ht:approx_traffic>
      <ht:picture>https://example.com/trend.jpg</ht:picture>
      <ht:news_item>
        <ht:news_item_title>関連ニュース1</ht:news_item_title>
        <ht:news_item_url>https://example.com/news1</ht:news_item_url>
        <ht:news_item_picture>https://example.com/news1.jpg</ht:news_item_picture>
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
    const items: TrendItem[] = parseTrendsXml(SAMPLE_RSS);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('テストキーワード');
    expect(items[0].traffic).toBe(100000);
    expect(items[0].picture).toBe('https://example.com/trend.jpg');
    expect(items[0].newsItems).toHaveLength(1);
    expect(items[0].newsItems[0].title).toBe('関連ニュース1');
    expect(items[0].newsItems[0].picture).toBe('https://example.com/news1.jpg');
    expect(items[1].title).toBe('もう一つのキーワード');
    expect(items[1].traffic).toBe(50000);
    expect(items[1].picture).toBe('');
    expect(items[1].newsItems).toHaveLength(0);
  });

  it('should return an empty array when there are no items', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><rss><channel></channel></rss>`;
    expect(parseTrendsXml(xml)).toEqual([]);
  });

  it('should handle multiple news items per trend', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:ht="https://trends.google.co.jp/trends/trendingsearches/daily" version="2.0">
  <channel>
    <item>
      <title>複数ニュース</title>
      <ht:approx_traffic>1,000+</ht:approx_traffic>
      <ht:news_item>
        <ht:news_item_title>ニュースA</ht:news_item_title>
        <ht:news_item_url>https://example.com/a</ht:news_item_url>
        <ht:news_item_picture>https://example.com/a.jpg</ht:news_item_picture>
      </ht:news_item>
      <ht:news_item>
        <ht:news_item_title>ニュースB</ht:news_item_title>
        <ht:news_item_url>https://example.com/b</ht:news_item_url>
        <ht:news_item_picture></ht:news_item_picture>
      </ht:news_item>
    </item>
  </channel>
</rss>`;
    const items = parseTrendsXml(xml);
    expect(items[0].newsItems).toHaveLength(2);
    expect(items[0].newsItems.map((n) => n.title)).toEqual(['ニュースA', 'ニュースB']);
  });
});

function makeTrend(overrides: Partial<TrendItem> = {}): TrendItem {
  return {
    title: 'キーワード',
    traffic: 1000,
    picture: '',
    newsItems: [],
    ...overrides,
  };
}

describe('breakingWeight', () => {
  it('should weight weather and disaster keywords highest', () => {
    expect(breakingWeight(makeTrend({ title: 'ゲリラ豪雨' }))).toBe(3);
    expect(breakingWeight(makeTrend({ title: '震度5強' }))).toBe(3);
  });

  it('should weight incidents and accidents highest', () => {
    expect(breakingWeight(makeTrend({ title: '人身事故' }))).toBe(3);
  });

  it('should weight transport disruption above ordinary trends', () => {
    expect(breakingWeight(makeTrend({ title: '中央線 運転見合わせ' }))).toBe(2);
  });

  it('should match against attached headlines, not just the keyword', () => {
    const trend = makeTrend({
      title: 'サイモニ・ブニランギ',
      newsItems: [{ title: 'ラグビー選手が練習中の熱中症で死亡', url: '', picture: '' }],
    });
    expect(breakingWeight(trend)).toBe(3);
  });

  it('should return 1 for ordinary trends', () => {
    expect(breakingWeight(makeTrend({ title: '新型ハリアー' }))).toBe(1);
  });
});

describe('rankTrends', () => {
  it('should put a breaking topic above a higher-traffic ordinary topic', () => {
    const ranked = rankTrends([
      makeTrend({ title: '人気アイドル', traffic: 20000 }),
      makeTrend({ title: 'ゲリラ豪雨', traffic: 10000 }),
    ]);

    expect(ranked.map((t) => t.title)).toEqual(['ゲリラ豪雨', '人気アイドル']);
  });

  it('should still rank by traffic within the same weight', () => {
    const ranked = rankTrends([
      makeTrend({ title: '人身事故', traffic: 5000 }),
      makeTrend({ title: '火災', traffic: 50000 }),
    ]);

    expect(ranked.map((t) => t.title)).toEqual(['火災', '人身事故']);
  });

  it('should not mutate the input array', () => {
    const input = [
      makeTrend({ title: 'ふつう', traffic: 20000 }),
      makeTrend({ title: '地震', traffic: 10000 }),
    ];
    rankTrends(input);
    expect(input[0].title).toBe('ふつう');
  });
});

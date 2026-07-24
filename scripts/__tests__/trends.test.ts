import { describe, it, expect } from 'vitest';
import { parseTrendsXml, type TrendItem } from '../trends';

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

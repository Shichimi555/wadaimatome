import { describe, it, expect } from 'vitest';
import { filterNewTrends, type ExistingArticle } from '../dedup';
import type { TrendItem } from '../trends';

describe('filterNewTrends', () => {
  const trends: TrendItem[] = [
    { title: '新しい話題', traffic: 100000, picture: '', newsItems: [] },
    { title: '既存の話題', traffic: 50000, picture: '', newsItems: [] },
    { title: '古い話題', traffic: 30000, picture: '', newsItems: [] },
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

  it('should respect a custom hoursBack parameter', () => {
    const date = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const existing: ExistingArticle[] = [
      { keyword: '既存の話題', pubDate: date },
    ];
    const result = filterNewTrends(trends, existing, 1);
    expect(result).toHaveLength(3);
  });

  it('should return all trends when there are no existing articles', () => {
    const result = filterNewTrends(trends, []);
    expect(result).toHaveLength(3);
  });
});

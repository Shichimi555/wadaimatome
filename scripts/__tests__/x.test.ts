import { describe, it, expect } from 'vitest';
import {
  TWEET_LIMIT,
  buildTweet,
  toHashtag,
  truncateToWeight,
  weightedLength,
} from '../x';






describe('weightedLength', () => {
  it('should count Latin characters as 1', () => {
    expect(weightedLength('hello')).toBe(5);
  });

  it('should count Japanese characters as 2', () => {
    expect(weightedLength('話題')).toBe(4);
  });

  it('should count any URL as 23', () => {
    expect(weightedLength('https://wadaimatome.com/articles/a-very-long-slug-here/')).toBe(23);
  });

  it('should combine text and URLs', () => {
    expect(weightedLength('話題 https://wadaimatome.com/')).toBe(4 + 1 + 23);
  });
});

describe('truncateToWeight', () => {
  it('should leave text that already fits', () => {
    expect(truncateToWeight('短い', 10)).toBe('短い');
  });

  it('should cut to the budget and mark the cut', () => {
    const result = truncateToWeight('あいうえおかきくけこ', 10);

    expect(result.endsWith('…')).toBe(true);
    expect(weightedLength(result)).toBeLessThanOrEqual(10);
  });
});

describe('toHashtag', () => {
  it('should strip characters that would end the hashtag early', () => {
    expect(toHashtag('東京 都')).toBe('東京都');
    expect(toHashtag('株価・速報')).toBe('株価速報');
  });
});

describe('buildTweet', () => {
  const base = {
    title: 'タイトル',
    description: '本文の要約です',
    url: 'https://wadaimatome.com/articles/test/',
    tags: ['台風', '気象'],
  };

  it('should put the description, URL and hashtags together', () => {
    const tweet = buildTweet(base);

    expect(tweet).toContain('本文の要約です');
    expect(tweet).toContain('https://wadaimatome.com/articles/test/');
    expect(tweet).toContain('#台風 #気象 #話題まとめ');
  });

  it('should stay inside the weighted limit for a long description', () => {
    const tweet = buildTweet({ ...base, description: 'あ'.repeat(500) });

    expect(weightedLength(tweet)).toBeLessThanOrEqual(TWEET_LIMIT);
    expect(tweet).toContain('…');
    expect(tweet).toContain('https://wadaimatome.com/articles/test/');
    expect(tweet).toContain('#話題まとめ');
  });

  it('should use at most two article hashtags', () => {
    const tweet = buildTweet({ ...base, tags: ['a', 'b', 'c', 'd'] });

    expect(tweet).toContain('#a #b #話題まとめ');
    expect(tweet).not.toContain('#c');
  });

  it('should fall back to the title when there is no description', () => {
    expect(buildTweet({ ...base, description: '  ' })).toContain('タイトル');
  });
});



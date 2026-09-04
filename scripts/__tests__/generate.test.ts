import { describe, it, expect } from 'vitest';
import { buildPublishNotification, type PublishedArticle } from '../generate';

const article = (over: Partial<PublishedArticle> = {}): PublishedArticle => ({
  title: 'テストタイトル',
  slug: '2026-09-04-テスト',
  description: 'テスト説明文',
  tags: ['タグ1', 'タグ2'],
  ...over,
});

describe('buildPublishNotification', () => {
  it('should carry the live url, an edit link, and a promotion tweet', () => {
    const text = buildPublishNotification([article()]);
    expect(text).toContain('**テストタイトル**');
    expect(text).toContain('https://wadaimatome.com/articles/2026-09-04-%E3%83%86%E3%82%B9%E3%83%88/');
    expect(text).toContain('github.com/Shichimi555/wadaimatome/edit/main/src/content/articles/');
    expect(text).toContain('テスト説明文');
    expect(text).toContain('#タグ1');
    expect(text).toContain('#話題まとめ');
  });

  it('should not say anything about a later publish', () => {
    const text = buildPublishNotification([article()]);
    expect(text).not.toContain('自動公開');
    expect(text).not.toContain('参考ツイート');
  });

  it('should percent-encode the edit link so a bracket cannot cut it short', () => {
    const text = buildPublishNotification([article({ slug: '2026-09-04-速報（続報）' })]);
    expect(text).not.toContain('（');
    expect(text).toContain('%EF%BC%88');
  });

  it('should stay inside the discord embed limit by dropping entries', () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      article({ title: 'あ'.repeat(900), description: 'い'.repeat(900), slug: `slug-${i}` })
    );
    const text = buildPublishNotification(many);
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text).toContain('…ほか');
  });

  it('should keep every entry when they fit', () => {
    const text = buildPublishNotification([article({ slug: 'a' }), article({ slug: 'b' })]);
    expect(text).not.toContain('…ほか');
    expect(text.length).toBeLessThanOrEqual(4096);
  });
});

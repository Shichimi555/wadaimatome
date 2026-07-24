import { describe, it, expect } from 'vitest';
import { toSlug, toMarkdown } from '../markdown';
import type { GeneratedArticle } from '../article';

describe('toSlug', () => {
  it('should create a date-prefixed slug from keyword', () => {
    const date = new Date('2026-07-24T15:00:00+09:00');
    const slug = toSlug('テストキーワード', date);
    expect(slug).toBe('2026-07-24-テストキーワード');
  });

  it('should replace spaces and special chars with hyphens', () => {
    const date = new Date('2026-07-24T00:00:00Z');
    const slug = toSlug('hello world!', date);
    expect(slug).toBe('2026-07-24-hello-world');
  });
});

describe('toMarkdown', () => {
  it('should produce valid frontmatter + body', () => {
    const article: GeneratedArticle = {
      title: 'テスト記事',
      description: 'テスト説明',
      body: '## 見出し\n\n本文',
      tags: ['タグ1', 'タグ2'],
      trendKeyword: 'テスト',
      trafficVolume: 10000,
      pubDate: '2026-07-24T15:00:00+09:00',
      heroImage: 'https://example.com/hero.jpg',
    };
    const md = toMarkdown(article);
    expect(md).toContain('title: "テスト記事"');
    expect(md).toContain('tags: ["タグ1","タグ2"]');
    expect(md).toContain('heroImage: "https://example.com/hero.jpg"');
    expect(md).toContain('## 見出し');
    expect(md).toMatch(/^---\n/);
  });

  it('should omit heroImage when empty', () => {
    const article: GeneratedArticle = {
      title: 'タイトル',
      description: 'desc',
      body: 'body',
      tags: [],
      trendKeyword: 'kw',
      trafficVolume: 0,
      pubDate: '2026-07-24T15:00:00+09:00',
      heroImage: '',
    };
    const md = toMarkdown(article);
    expect(md).not.toContain('heroImage');
  });

  it('should escape double quotes in title', () => {
    const article: GeneratedArticle = {
      title: 'テスト"引用"タイトル',
      description: 'desc',
      body: 'body',
      tags: [],
      trendKeyword: 'kw',
      trafficVolume: 0,
      pubDate: '2026-07-24T15:00:00+09:00',
      heroImage: '',
    };
    const md = toMarkdown(article);
    expect(md).not.toContain('title: "テスト"引用"タイトル"');
    expect(md).toContain('title: "テスト\\"引用\\"タイトル"');
  });

  it('should include draft: true when draft option is set', () => {
    const article: GeneratedArticle = {
      title: 'ドラフト記事',
      description: 'desc',
      body: 'body',
      tags: ['tag'],
      trendKeyword: 'kw',
      trafficVolume: 100,
      pubDate: '2026-07-25T12:00:00+09:00',
      heroImage: '',
    };
    const md = toMarkdown(article, { draft: true });
    expect(md).toContain('draft: true');
  });

  it('should not include draft line when draft option is false or omitted', () => {
    const article: GeneratedArticle = {
      title: 'タイトル',
      description: 'desc',
      body: 'body',
      tags: [],
      trendKeyword: 'kw',
      trafficVolume: 0,
      pubDate: '2026-07-25T12:00:00+09:00',
      heroImage: '',
    };
    expect(toMarkdown(article)).not.toContain('draft');
    expect(toMarkdown(article, { draft: false })).not.toContain('draft');
  });
});

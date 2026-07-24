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
    };
    const md = toMarkdown(article);
    expect(md).toContain('title: "テスト記事"');
    expect(md).toContain('tags: ["タグ1","タグ2"]');
    expect(md).toContain('## 見出し');
    expect(md).toMatch(/^---\n/);
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
    };
    const md = toMarkdown(article);
    expect(md).not.toContain('title: "テスト"引用"タイトル"');
    expect(md).toContain('title: "テスト\\"引用\\"タイトル"');
  });
});

import { describe, it, expect } from 'vitest';
import {
  articleUrl,
  breakingScore,
  jstDay,
  parseArticle,
  selectArticles,
  type ArticleMeta,
  type TweetHistory,
} from '../tweet';

const NOW = new Date('2026-08-18T12:00:00+09:00');

function article(overrides: Partial<ArticleMeta> = {}): ArticleMeta {
  return {
    slug: '2026-08-18-test',
    title: '平常運転のニュース',
    description: '特に何もありません',
    tags: ['雑談'],
    pubDate: new Date('2026-08-18T11:00:00+09:00'),
    ...overrides,
  };
}

const breaking = (slug: string, pubDate: Date) =>
  article({ slug, title: '東海道線で人身事故', pubDate });

const history = (posted: TweetHistory['posted'] = []): TweetHistory => ({ posted });

describe('jstDay', () => {
  it('should use the JST calendar day, not UTC', () => {
    expect(jstDay(new Date('2026-08-18T16:30:00Z'))).toBe('2026-08-19');
  });
});

describe('parseArticle', () => {
  const frontmatter = `---
title: "台風19号が接近"
description: "関東に上陸の見込み"
pubDate: 2026-08-18T09:00:00+09:00
tags: ["台風", "気象"]
---

本文`;

  it('should read the fields it needs', () => {
    const parsed = parseArticle('2026-08-18-台風.md', frontmatter);

    expect(parsed).toEqual({
      slug: '2026-08-18-台風',
      title: '台風19号が接近',
      description: '関東に上陸の見込み',
      tags: ['台風', '気象'],
      pubDate: new Date('2026-08-18T09:00:00+09:00'),
    });
  });

  it('should skip drafts', () => {
    expect(parseArticle('a.md', frontmatter.replace('---\n\n本文', 'draft: true\n---\n\n本文'))).toBeNull();
  });

  it('should skip a file with no usable pubDate', () => {
    expect(parseArticle('a.md', '---\ntitle: "x"\n---\n')).toBeNull();
  });

  it('should tolerate malformed tags', () => {
    const parsed = parseArticle('a.md', frontmatter.replace('["台風", "気象"]', '[broken'));
    expect(parsed?.tags).toEqual([]);
  });
});

describe('breakingScore', () => {
  it('should score weather and incidents highest', () => {
    expect(breakingScore(article({ title: '記録的な豪雨' }))).toBe(3);
    expect(breakingScore(article({ title: '中央線で人身事故' }))).toBe(3);
  });

  it('should score transport disruption in the middle', () => {
    expect(breakingScore(article({ title: '山手線が運転見合わせ' }))).toBe(2);
  });

  it('should score everything else at 1', () => {
    expect(breakingScore(article())).toBe(1);
  });

  it('should look at tags as well as the title', () => {
    expect(breakingScore(article({ tags: ['地震'] }))).toBe(3);
  });

  it('should ignore the description, which is model-written copy', () => {
    expect(breakingScore(article({ description: '大雨による事故で死亡' }))).toBe(1);
  });

  it('should not treat "速報" or "緊急" as evidence of breaking news', () => {
    expect(breakingScore(article({ title: '【速報】ドジャース戦の結果' }))).toBe(1);
    expect(breakingScore(article({ title: '緊急企画！夏の特集' }))).toBe(1);
  });

  it('should not read 打線爆発 as an explosion', () => {
    expect(breakingScore(article({ title: 'マーリンズ打線爆発で逆転勝利' }))).toBe(1);
  });

  it('should still catch a real explosion', () => {
    expect(breakingScore(article({ title: '工場で爆発事故' }))).toBe(3);
  });
});

describe('selectArticles', () => {
  it('should only pick breaking news', () => {
    const picked = selectArticles(
      [article({ slug: 'ordinary' }), breaking('urgent', new Date('2026-08-18T11:30:00+09:00'))],
      history(),
      NOW
    );

    expect(picked.map((a) => a.slug)).toEqual(['urgent']);
  });

  it('should prefer the newest when several qualify', () => {
    const picked = selectArticles(
      [
        breaking('older', new Date('2026-08-18T06:00:00+09:00')),
        breaking('newer', new Date('2026-08-18T11:30:00+09:00')),
      ],
      history(),
      NOW,
      { perRunLimit: 1 }
    );

    expect(picked.map((a) => a.slug)).toEqual(['newer']);
  });

  it('should skip anything already posted', () => {
    const picked = selectArticles(
      [breaking('done', new Date('2026-08-18T11:30:00+09:00'))],
      history([{ slug: 'done', at: '2026-08-18T11:35:00+09:00' }]),
      NOW
    );

    expect(picked).toEqual([]);
  });

  it('should skip news that has gone stale', () => {
    const picked = selectArticles(
      [breaking('old', new Date('2026-08-16T12:00:00+09:00'))],
      history(),
      NOW,
      { maxAgeHours: 24 }
    );

    expect(picked).toEqual([]);
  });

  it('should ignore articles dated in the future', () => {
    const picked = selectArticles(
      [breaking('future', new Date('2026-08-19T12:00:00+09:00'))],
      history(),
      NOW
    );

    expect(picked).toEqual([]);
  });

  it('should stop once the day is used up', () => {
    const posted = Array.from({ length: 5 }, (_, i) => ({
      slug: `posted-${i}`,
      at: '2026-08-18T09:00:00+09:00',
    }));
    const picked = selectArticles(
      [breaking('fresh', new Date('2026-08-18T11:30:00+09:00'))],
      history(posted),
      NOW,
      { dailyLimit: 5 }
    );

    expect(picked).toEqual([]);
  });

  it('should not count yesterday against today', () => {
    const posted = Array.from({ length: 5 }, (_, i) => ({
      slug: `posted-${i}`,
      at: '2026-08-17T09:00:00+09:00',
    }));
    const picked = selectArticles(
      [breaking('fresh', new Date('2026-08-18T11:30:00+09:00'))],
      history(posted),
      NOW,
      { dailyLimit: 5 }
    );

    expect(picked.map((a) => a.slug)).toEqual(['fresh']);
  });

  it('should never exceed the per-run limit', () => {
    const articles = Array.from({ length: 4 }, (_, i) =>
      breaking(`b-${i}`, new Date('2026-08-18T11:00:00+09:00'))
    );

    expect(selectArticles(articles, history(), NOW, { perRunLimit: 1 })).toHaveLength(1);
  });

  it('should honour a raised daily limit', () => {
    const articles = Array.from({ length: 4 }, (_, i) =>
      breaking(`b-${i}`, new Date('2026-08-18T11:00:00+09:00'))
    );

    expect(
      selectArticles(articles, history(), NOW, { perRunLimit: 3, dailyLimit: 10 })
    ).toHaveLength(3);
  });
});

describe('articleUrl', () => {
  it('should percent-encode the slug and keep the trailing slash', () => {
    expect(articleUrl('2026-08-17-風', 'https://wadaimatome.com')).toBe(
      'https://wadaimatome.com/articles/2026-08-17-%E9%A2%A8/'
    );
  });
});

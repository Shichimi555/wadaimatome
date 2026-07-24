import { describe, it, expect } from 'vitest';
import { removeDraftFlag, buildTweetSuggestion } from '../publish';

describe('removeDraftFlag', () => {
  it('should remove draft: true line from frontmatter', () => {
    const input = `---
title: "テスト"
description: "desc"
pubDate: 2026-07-25T12:00:00+09:00
tags: ["tag"]
trendKeyword: "kw"
trafficVolume: 100
draft: true
---

本文`;
    const result = removeDraftFlag(input);
    expect(result).not.toContain('draft: true');
    expect(result).toContain('title: "テスト"');
    expect(result).toContain('本文');
  });

  it('should return null when no draft flag is present', () => {
    const input = `---
title: "テスト"
description: "desc"
pubDate: 2026-07-25T12:00:00+09:00
tags: ["tag"]
trendKeyword: "kw"
trafficVolume: 100
---

本文`;
    expect(removeDraftFlag(input)).toBeNull();
  });
});

describe('buildTweetSuggestion', () => {
  it('should build a tweet from description, url, and tags', () => {
    const tweet = buildTweetSuggestion({
      description: 'テスト説明文',
      url: 'https://example.com/articles/test',
      tags: ['タグ1', 'タグ2'],
    });
    expect(tweet).toContain('テスト説明文');
    expect(tweet).toContain('https://example.com/articles/test');
    expect(tweet).toContain('#タグ1');
    expect(tweet).toContain('#タグ2');
    expect(tweet).toContain('#話題まとめ');
  });
});

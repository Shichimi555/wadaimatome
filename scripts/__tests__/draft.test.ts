import { describe, it, expect } from 'vitest';
import { buildGroundedPrompt, buildSourcedPrompt, parseDraft } from '../draft';
import type { TrendItem } from '../trends';

const trend: TrendItem = {
  title: '福岡県議会 問題',
  traffic: 5000,
  picture: '',
  newsItems: [
    { title: '6人目の証言', url: 'https://example.com/a', picture: '' },
    { title: '会派が名称変更', url: 'https://example.com/b', picture: '' },
  ],
};

const valid = JSON.stringify({
  title: 'タイトル',
  description: '説明',
  tags: ['a', 'b'],
  body: '## 見出し\n本文',
});

describe('buildGroundedPrompt', () => {
  it('passes the headlines and their links through', () => {
    const p = buildGroundedPrompt(trend);
    expect(p).toContain('福岡県議会 問題');
    expect(p).toContain('6人目の証言 (https://example.com/a)');
  });

  it('omits the news section when the trend has none', () => {
    expect(buildGroundedPrompt({ ...trend, newsItems: [] })).not.toContain('関連ニュース');
  });
});

describe('buildSourcedPrompt', () => {
  it('includes the source text and forbids inventing beyond it', () => {
    const p = buildSourcedPrompt(trend, '## 見出し\n記事本文');
    expect(p).toContain('記事本文');
    expect(p).toContain('参考資料に書かれていない事実を創作しないこと');
  });

  it('tells the model to stay minimal when nothing could be fetched', () => {
    // Without sources this engine has no facts at all, so the risk of it
    // filling the gap from memory is highest exactly here.
    const p = buildSourcedPrompt(trend, '');
    expect(p).toContain('参考資料は取得できませんでした');
  });
});

describe('both prompts', () => {
  it('ask for the same output shape', () => {
    const spec = '以下のJSON形式で出力してください';
    expect(buildGroundedPrompt(trend)).toContain(spec);
    expect(buildSourcedPrompt(trend, 'x')).toContain(spec);
    for (const p of [buildGroundedPrompt(trend), buildSourcedPrompt(trend, 'x')]) {
      expect(p).toContain('「ネットの反応」セクションは書かないこと');
      expect(p).toContain('SNSの投稿内容を創作・引用しないこと');
    }
  });
});

describe('parseDraft', () => {
  it('returns the four fields', () => {
    expect(parseDraft(valid, 'test')).toEqual({
      title: 'タイトル',
      description: '説明',
      tags: ['a', 'b'],
      body: '## 見出し\n本文',
    });
  });

  it('ignores prose around the object', () => {
    expect(parseDraft(`はい:\n${valid}\n以上`, 'test').title).toBe('タイトル');
  });

  it('names the engine when there is no JSON', () => {
    expect(() => parseDraft('ただの文章です', 'Workers AI response')).toThrow(/Workers AI response/);
  });

  it('rejects a response missing a field', () => {
    const missing = JSON.stringify({ title: 'a', description: 'b', tags: [] });
    expect(() => parseDraft(missing, 'test')).toThrow(/Invalid response shape/);
  });

  it('coerces tags to strings', () => {
    const numeric = JSON.stringify({ title: 'a', description: 'b', body: 'c', tags: [1, 2] });
    expect(parseDraft(numeric, 'test').tags).toEqual(['1', '2']);
  });
});

import { describe, it, expect } from 'vitest';
import { countTags, indexableTags, splitTags, breadcrumbTag, MIN_TAG_ARTICLES } from '../tags';

const article = (tags: string[]) => ({ data: { tags } }) as any;

const ARTICLES = [
  article(['高田みづえ', 'うたコン', '音楽番組', '歌手']),
  article(['音楽番組', '歌手']),
  article(['音楽番組']),
];

describe('countTags', () => {
  it('should count how many articles each tag holds', () => {
    const counts = countTags(ARTICLES);

    expect(counts.get('音楽番組')).toBe(3);
    expect(counts.get('歌手')).toBe(2);
    expect(counts.get('うたコン')).toBe(1);
  });
});

describe('indexableTags', () => {
  it('should drop tags that hold a single article', () => {
    expect(indexableTags(countTags(ARTICLES)).sort()).toEqual(['歌手', '音楽番組']);
  });

  it('should keep a tag sitting exactly on the threshold', () => {
    const counts = new Map([['x', MIN_TAG_ARTICLES]]);

    expect(indexableTags(counts)).toEqual(['x']);
  });
});

describe('splitTags', () => {
  it('should link only the tags that have a page, and keep the rest as labels', () => {
    const { linked, plain } = splitTags(ARTICLES[0].data.tags, countTags(ARTICLES));

    expect(linked).toEqual(['音楽番組', '歌手']);
    expect(plain).toEqual(['高田みづえ', 'うたコン']);
  });

  it('should preserve the order the article wrote its tags in', () => {
    const counts = new Map([['b', 5], ['a', 5]]);

    expect(splitTags(['a', 'b'], counts).linked).toEqual(['a', 'b']);
  });
});

describe('breadcrumbTag', () => {
  it('should pick the broadest tag rather than the first one', () => {
    expect(breadcrumbTag(ARTICLES[0].data.tags, countTags(ARTICLES))).toBe('音楽番組');
  });

  it('should return nothing when every tag is a one-off', () => {
    const counts = new Map([['x', 1], ['y', 1]]);

    expect(breadcrumbTag(['x', 'y'], counts)).toBeUndefined();
  });
});

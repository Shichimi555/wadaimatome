import { describe, it, expect } from 'vitest';
import { articleUrl } from '../urls';

describe('articleUrl', () => {
  it('should percent-encode the slug and keep the trailing slash', () => {
    expect(articleUrl('2026-08-17-風-薫る', 'https://wadaimatome.com')).toBe(
      'https://wadaimatome.com/articles/2026-08-17-%E9%A2%A8-%E8%96%AB%E3%82%8B/'
    );
  });

  it('should leave an ASCII slug alone', () => {
    expect(articleUrl('2026-07-25-rosenborg-vs-man-united', 'https://wadaimatome.com')).toBe(
      'https://wadaimatome.com/articles/2026-07-25-rosenborg-vs-man-united/'
    );
  });
});

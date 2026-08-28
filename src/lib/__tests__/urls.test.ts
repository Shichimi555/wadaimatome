import { describe, it, expect } from 'vitest';
import { articlePath, tagPath, pagePath } from '../urls';

describe('articlePath', () => {
  it('should end in a slash so Cloudflare never has to redirect', () => {
    expect(articlePath('2026-08-18-x')).toBe('/articles/2026-08-18-x/');
  });

  it('should percent-encode Japanese slugs the way the canonical does', () => {
    expect(articlePath('2026-08-18-高田みづえ')).toBe(
      '/articles/2026-08-18-%E9%AB%98%E7%94%B0%E3%81%BF%E3%81%A5%E3%81%88/'
    );
  });

  it('should encode characters that would otherwise change the path', () => {
    expect(articlePath('a/b?c#d')).toBe('/articles/a%2Fb%3Fc%23d/');
  });
});

describe('tagPath', () => {
  it('should encode and close with a slash', () => {
    expect(tagPath('地震')).toBe('/tags/%E5%9C%B0%E9%9C%87/');
  });
});

describe('pagePath', () => {
  it('should send page 1 to the base path itself', () => {
    expect(pagePath('/', 1)).toBe('/');
    expect(pagePath('/tags/%E5%9C%B0%E9%9C%87/', 1)).toBe('/tags/%E5%9C%B0%E9%9C%87/');
  });

  it('should number later pages under the base path', () => {
    expect(pagePath('/', 2)).toBe('/2/');
    expect(pagePath('/tags/%E5%9C%B0%E9%9C%87/', 3)).toBe('/tags/%E5%9C%B0%E9%9C%87/3/');
  });

  it('should not double the separator when the base already ends in one', () => {
    expect(pagePath('/tags/x/', 2)).toBe('/tags/x/2/');
  });
});

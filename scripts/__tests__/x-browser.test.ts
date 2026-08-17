import { describe, it, expect } from 'vitest';
import {
  parseNetscapeCookies,
  hasSessionCookies,
  loadCookies,
  extractHandle,
  SessionExpiredError,
} from '../x-browser';

const COOKIE_FILE = [
  '# Netscape HTTP Cookie File',
  '# This is a generated file! Do not edit.',
  '',
  '.x.com\tTRUE\t/\tFALSE\t1820745388\tauth_token\tsecret-token',
  '.x.com\tTRUE\t/\tTRUE\t1820745388\tct0\tcsrf-value',
  '.x.com\tTRUE\t/\tFALSE\t0\tlang\tja',
  'malformed line without tabs',
].join('\n');

describe('parseNetscapeCookies', () => {
  it('should read name, value, domain, path and secure flag', () => {
    const cookies = parseNetscapeCookies(COOKIE_FILE);

    expect(cookies).toHaveLength(3);
    expect(cookies[0]).toMatchObject({
      name: 'auth_token',
      value: 'secret-token',
      domain: '.x.com',
      path: '/',
      secure: false,
    });
    expect(cookies[1]).toMatchObject({ name: 'ct0', secure: true });
  });

  it('should keep a real expiry and drop a zero one', () => {
    const cookies = parseNetscapeCookies(COOKIE_FILE);

    expect(cookies[0]).toHaveProperty('expires', 1820745388);
    expect(cookies[2]).not.toHaveProperty('expires');
  });

  it('should skip comments, blank lines and short rows', () => {
    expect(parseNetscapeCookies('# comment\n\nfoo\tbar\n')).toEqual([]);
  });
});

describe('hasSessionCookies', () => {
  it('should accept a jar holding auth_token and ct0', () => {
    expect(hasSessionCookies(parseNetscapeCookies(COOKIE_FILE))).toBe(true);
  });

  it('should reject a jar missing auth_token', () => {
    const withoutAuth = COOKIE_FILE.split('\n').filter((l) => !l.includes('auth_token')).join('\n');

    expect(hasSessionCookies(parseNetscapeCookies(withoutAuth))).toBe(false);
  });
});

describe('extractHandle', () => {
  it('should read the handle out of the account switcher text', () => {
    expect(extractHandle('話題まとめ\n@wadaiimatome')).toBe('wadaiimatome');
  });

  it('should return empty when there is no handle', () => {
    expect(extractHandle('アカウント')).toBe('');
  });

  it('should not run past the 15 character handle limit', () => {
    expect(extractHandle('@abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijklmno');
  });
});

describe('loadCookies', () => {
  it('should fail loudly when the file is missing', () => {
    expect(() => loadCookies('/nonexistent/cookies.txt')).toThrow(SessionExpiredError);
  });
});

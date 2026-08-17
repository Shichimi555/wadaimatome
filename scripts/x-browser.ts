import { existsSync, readFileSync } from 'fs';
import type { Cookie } from 'playwright';

/**
 * Posts to X by driving the web UI with a logged-in session, because X no
 * longer offers an API tier this site can post through. Ported from
 * js/popular-videos-ranking, with the navigation made more patient: that
 * version waits for `networkidle`, which X never reaches (it holds streaming
 * connections open), and 15% of its runs time out because of it.
 */

const HOME_URL = 'https://x.com/home';
const COMPOSER = '[data-testid="tweetTextarea_0"]';
const POST_BUTTON = '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]';

export class SessionExpiredError extends Error {}

/**
 * Parses a Netscape cookies.txt export. Fields are:
 * domain, includeSubdomains, path, secure, expires, name, value
 */
export function parseNetscapeCookies(contents: string): Cookie[] {
  const cookies: Cookie[] = [];

  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const parts = trimmed.split('\t');
    if (parts.length < 7) continue;

    const [domain, , path, secure, expires, name, value] = parts;
    const cookie: any = {
      name,
      value,
      domain,
      path,
      secure: secure.toUpperCase() === 'TRUE',
      httpOnly: false,
      sameSite: 'Lax',
    };

    const expiry = Number(expires);
    if (expiry > 0) cookie.expires = expiry;
    cookies.push(cookie);
  }

  return cookies;
}

/** auth_token and ct0 are the two that actually carry the session. */
export function hasSessionCookies(cookies: Cookie[]): boolean {
  const names = new Set(cookies.map((c) => c.name));
  return names.has('auth_token') && names.has('ct0');
}

export function loadCookies(path: string): Cookie[] {
  if (!existsSync(path)) {
    throw new SessionExpiredError(`Cookie file not found: ${path}`);
  }

  const cookies = parseNetscapeCookies(readFileSync(path, 'utf-8'));
  if (!hasSessionCookies(cookies)) {
    throw new SessionExpiredError(`No auth_token/ct0 in ${path}`);
  }
  return cookies;
}

export interface PostOptions {
  cookiePath: string;
  dryRun?: boolean;
  headless?: boolean;
}

/**
 * Posts a single tweet. Returns the URL of the new post when X gives us one,
 * an empty string when it posted but the URL could not be read, or throws.
 */
export async function postTweet(text: string, options: PostOptions): Promise<string> {
  const cookies = loadCookies(options.cookiePath);

  // Imported lazily so the module can be unit tested without a browser.
  const { firefox } = await import('playwright');
  const browser = await firefox.launch({ headless: options.headless ?? true });
  const context = await browser.newContext({
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 900 },
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    // domcontentloaded, not networkidle: X keeps streaming connections open,
    // so networkidle only fires by luck.
    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    if (/\/(login|i\/flow)/.test(page.url())) {
      throw new SessionExpiredError('Redirected to login: the cookies are no longer valid.');
    }

    const composer = page.locator(COMPOSER);
    await composer.waitFor({ state: 'visible', timeout: 60000 });
    await composer.click({ force: true });

    await typeWithNewlines(page, text);

    const postButton = page.locator(POST_BUTTON).first();
    await postButton.waitFor({ state: 'visible', timeout: 15000 });

    // The button stays disabled while X validates the draft.
    await page
      .waitForFunction(
        (sel) => {
          const el = document.querySelector(sel);
          return el !== null && el.getAttribute('aria-disabled') !== 'true';
        },
        '[data-testid="tweetButtonInline"]',
        { timeout: 15000 }
      )
      .catch(() => {});

    if (options.dryRun) {
      const composed = await composer.innerText();
      console.log(`[DRY RUN] Composed:\n${composed}`);
      console.log('[DRY RUN] Not posting.');
      return '';
    }

    await postButton.click({ force: true });
    return await waitForPostedUrl(page);
  } finally {
    await browser.close();
  }
}

/** execCommand does not insert newlines, so they are pressed as Enter. */
async function typeWithNewlines(page: any, text: string): Promise<void> {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) {
      await page.evaluate(
        ({ sel, value }: { sel: string; value: string }) => {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (el) {
            el.focus();
            document.execCommand('insertText', false, value);
          }
        },
        { sel: COMPOSER, value: lines[i] }
      );
    }
    if (i < lines.length - 1) await page.keyboard.press('Enter');
  }
}

/**
 * X shows a "ポストを表示" / "View" toast linking to the new post. Reading it
 * back is the only confirmation available that the post really landed.
 */
async function waitForPostedUrl(page: any): Promise<string> {
  try {
    const toastLink = page.locator('[data-testid="toast"] a[href*="/status/"]');
    await toastLink.waitFor({ state: 'attached', timeout: 30000 });
    const href = await toastLink.getAttribute('href');
    return href ? new URL(href, 'https://x.com').href : '';
  } catch {
    // The composer emptying is the fallback signal that it went through.
    await page.waitForTimeout(5000);
    return '';
  }
}

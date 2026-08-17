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
export class WrongAccountError extends Error {}
export class ComposeMismatchError extends Error {}
export class PostRejectedError extends Error {}
export class PostUnconfirmedError extends Error {}

/** Draft.js keeps each line in its own block; that is where the text lives. */
export const COMPOSER_BLOCKS = '[data-contents] > div';

/** Pulls the @handle out of the sidebar account switcher's text. */
export function extractHandle(text: string): string {
  const match = text.match(/@([A-Za-z0-9_]{1,15})/);
  return match ? match[1] : '';
}

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
  /**
   * Handle the session must belong to. Exports from a browser holding several
   * logged-in accounts carry auth_multi, and X can open as the wrong one --
   * posting this site's articles from an unrelated account.
   */
  expectedHandle?: string;
}

/**
 * Posts a single tweet. Returns the URL of the new post when X gives us one,
 * an empty string when it posted but the URL could not be read, or throws.
 */
export async function postTweet(text: string, options: PostOptions): Promise<string> {
  const cookies = loadCookies(options.cookiePath);

  // Chromium, not Firefox: Firefox's contenteditable handling loses CJK text
  // on every entry method that survives Draft.js.
  // Imported lazily so the module can be unit tested without a browser.
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: options.headless ?? true });
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

    const handle = await readActiveHandle(page);
    console.log(`[INFO] Signed in as @${handle || '(unknown)'}`);
    if (options.expectedHandle && handle && handle.toLowerCase() !== options.expectedHandle.toLowerCase()) {
      throw new WrongAccountError(
        `Session is @${handle}, expected @${options.expectedHandle}. Refusing to post.`
      );
    }

    const composer = page.locator(COMPOSER);
    await composer.waitFor({ state: 'visible', timeout: 60000 });
    await composer.click({ force: true });

    await composer.fill(text);

    // Verify before clicking anything. document.execCommand('insertText'),
    // which the implementation this was ported from uses, gets applied twice
    // by Draft.js in both Firefox and Chromium and silently doubles the body.
    const composed = await readComposerText(page);
    if (composed !== text) {
      throw new ComposeMismatchError(
        `Composer holds different text than intended.\n--- intended ---\n${text}\n--- composer ---\n${composed}`
      );
    }

    const postButton = page.locator(POST_BUTTON).first();
    await postButton.waitFor({ state: 'visible', timeout: 15000 });

    // X leaves the button disabled when it will not accept the draft -- most
    // often because it is over the character limit. Treating that as a
    // transient wait means clicking a dead button and calling it a success.
    try {
      await page.waitForFunction(
        (sel: string) => {
          const el = document.querySelector(sel);
          return el !== null && el.getAttribute('aria-disabled') !== 'true';
        },
        '[data-testid="tweetButtonInline"]',
        { timeout: 15000 }
      );
    } catch {
      throw new PostRejectedError(
        'X kept the post button disabled, so it will not accept this draft. ' +
          'Most likely the text is over the limit.'
      );
    }

    if (options.dryRun) {
      console.log(`[DRY RUN] Composer verified:\n${composed}`);
      console.log('[DRY RUN] Not posting.');
      return '';
    }

    await postButton.click({ force: true });
    return await waitForPostedUrl(page);
  } finally {
    await browser.close();
  }
}

async function readActiveHandle(page: any): Promise<string> {
  try {
    const button = page.locator('[data-testid="SideNav_AccountSwitcher_Button"]');
    await button.waitFor({ state: 'attached', timeout: 30000 });
    return extractHandle(await button.innerText());
  } catch {
    return '';
  }
}

/** Reads the composer back the way Draft.js stores it: one block per line. */
async function readComposerText(page: any): Promise<string> {
  return page.evaluate(
    ({ composer, blocks }: { composer: string; blocks: string }) => {
      const el = document.querySelector(composer);
      if (!el) return '';
      return Array.from(el.querySelectorAll(blocks))
        .map((b) => (b as HTMLElement).textContent ?? '')
        .join('\n');
    },
    { composer: COMPOSER, blocks: COMPOSER_BLOCKS }
  );
}

/**
 * Confirms the post actually landed and returns its URL when X offers one.
 *
 * The caller records history from this, so "probably fine" is not good enough:
 * an unconfirmed post marked as sent means the article is never tweeted, and
 * one marked as failed when it did send means it goes out twice. X gives two
 * independent signals -- a toast linking to the new post, and the composer
 * clearing -- so this requires at least one of them.
 */
async function waitForPostedUrl(page: any): Promise<string> {
  try {
    const toastLink = page.locator('[data-testid="toast"] a[href*="/status/"]');
    await toastLink.waitFor({ state: 'attached', timeout: 30000 });
    const href = await toastLink.getAttribute('href');
    if (href) return new URL(href, 'https://x.com').href;
  } catch {
    // Fall through to the composer check.
  }

  const cleared = await page
    .waitForFunction(
      ({ composer, blocks }: { composer: string; blocks: string }) => {
        const el = document.querySelector(composer);
        if (!el) return true;
        return Array.from(el.querySelectorAll(blocks))
          .every((b) => ((b as HTMLElement).textContent ?? '') === '');
      },
      { composer: COMPOSER, blocks: COMPOSER_BLOCKS },
      { timeout: 15000 }
    )
    .then(() => true)
    .catch(() => false);

  if (!cleared) {
    throw new PostUnconfirmedError(
      'Clicked post but saw neither the confirmation toast nor the composer clearing. ' +
        'Check the account before running again -- it may or may not have gone out.'
    );
  }
  return '';
}

/**
 * Every internal URL is built here so that it matches the canonical form
 * exactly: percent-encoded, with a trailing slash.
 *
 * Cloudflare answers a slash-less path with a 307, and a *temporary* redirect
 * is a weak canonicalisation signal -- Google keeps the redirecting URL in the
 * index rather than folding it into the target. Search Console measured the
 * result: 551 pages filed under "ページにリダイレクトがあります", and 139 URLs
 * ranking twice, splitting 60 clicks and 1,643 impressions away from the twin
 * that should have held them.
 */

/** Encodes a path segment without escaping the slash that ends it. */
function segment(value: string): string {
  return encodeURIComponent(value);
}

export function articlePath(slug: string): string {
  return `/articles/${segment(slug)}/`;
}

export function tagPath(tag: string): string {
  return `/tags/${segment(tag)}/`;
}

/** Page 1 lives at the base path itself; Astro numbers the rest from 2. */
export function pagePath(basePath: string, page: number): string {
  const base = basePath.replace(/\/$/, '');
  if (page <= 1) return `${base}/`;
  return `${base}/${page}/`;
}

const SITE_URL = process.env.SITE_URL || 'https://wadaimatome.com';

/**
 * Canonical form of an article URL: percent-encoded with a trailing slash,
 * matching <link rel="canonical">. Anything else costs a redirect hop.
 */
export function articleUrl(slug: string, siteUrl = SITE_URL): string {
  return `${siteUrl}/articles/${encodeURIComponent(slug)}/`;
}

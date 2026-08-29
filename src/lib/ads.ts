// src/lib/ads.ts
// 忍者AdMax slot ids. These ship in the page source, so they are public values,
// not secrets.

export const AD_SLOTS = {
  /** PC inline 160x600, rendered in the right rail. */
  railRight: '2c90d91ca4aba295bac51010c5e49125',
  /**
   * PC inline 160x600 for the left rail. The tag writes the pending slot to a
   * single `window.admaxbanner` global before pulling in the loader that reads
   * it, so one id cannot serve two rails on a page: a left rail needs its own
   * slot from the admax console.
   */
  railLeft: undefined as string | undefined,
  /** SP inline 320x100, placed mid-article. Desktop user agents get an empty body. */
  mobileInline: 'abc73ecb880d6e619125f65029ab47bd',
  /** SP inline 300x250, placed where a reader has finished the article. */
  mobileRectangle: 'f7fb5a878d7503272ea533211099bbce',
} as const;

/**
 * A rail only exists at widths that fit 160 + 672 + 160 and its gutters. Keep in
 * sync with the `.ad-rails` media query in styles/global.css.
 */
export const RAIL_MEDIA = '(min-width: 1152px)';

/** Phones only, pairing with Tailwind's `md:hidden` (hidden from 768px up). */
export const MOBILE_MEDIA = '(max-width: 767px)';

/**
 * The admax tag writes itself out with document.write, so it has to run while
 * the parser sits at the position the ad belongs in — async, defer, and Astro's
 * bundling (which makes it a module, so deferred) all break it, and a
 * document.write after load replaces the whole document. That is a failure that
 * builds and deploys cleanly, so the tag is emitted from an inline script here
 * rather than written by hand at each placement.
 *
 * Writing the tag from a guarded script keeps that timing while letting a slot
 * skip the widths it would only burn an impression on.
 */
export function admaxTag(slot: string, media?: string): string {
  const src = JSON.stringify(`https://adm.shinobi.jp/s/${slot}`);
  // Split as '</scr'+'ipt>' so the HTML parser does not end this script early.
  const write = `document.write('<scr'+'ipt src="'+${src}+'"></scr'+'ipt>')`;
  return media ? `if(matchMedia(${JSON.stringify(media)}).matches){${write}}` : write;
}

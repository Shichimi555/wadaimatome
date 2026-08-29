import { describe, expect, it } from 'vitest';
import { AD_SLOTS, MOBILE_MEDIA, RAIL_MEDIA, admaxTag } from '../ads';

describe('admaxTag', () => {
  it('writes the tag for the given slot', () => {
    expect(admaxTag('abc123')).toContain('https://adm.shinobi.jp/s/abc123');
  });

  it('never emits a literal closing script tag', () => {
    // A bare </script> would end the inline script that carries this code.
    expect(admaxTag(AD_SLOTS.railRight)).not.toContain('</script');
  });

  it('writes a well-formed script element', () => {
    const written = new Function(
      `let out; const document = { write: (html) => { out = html; } }; ${admaxTag('xyz')}; return out;`
    )();
    expect(written).toBe('<script src="https://adm.shinobi.jp/s/xyz"></script>');
  });

  it('guards on the media query when one is given', () => {
    const code = admaxTag('xyz', RAIL_MEDIA);
    expect(code.startsWith(`if(matchMedia("${RAIL_MEDIA}").matches){`)).toBe(true);
    expect(code.endsWith('}')).toBe(true);
  });

  it('runs unconditionally when no media query is given', () => {
    expect(admaxTag('xyz')).not.toContain('matchMedia');
  });

  it('skips the write when the media query does not match', () => {
    const run = (matches: boolean) =>
      new Function(
        `let out = null;
         const document = { write: (html) => { out = html; } };
         const matchMedia = () => ({ matches: ${matches} });
         ${admaxTag('xyz', RAIL_MEDIA)};
         return out;`
      )();
    expect(run(false)).toBe(null);
    expect(run(true)).toContain('xyz');
  });
});

describe('slot configuration', () => {
  it('keeps the rails on distinct slots', () => {
    // admax stores the pending slot in one global, so two rails cannot share an id.
    expect(AD_SLOTS.railLeft).not.toBe(AD_SLOTS.railRight);
  });

  it('splits desktop and mobile at the same point the CSS does', () => {
    expect(RAIL_MEDIA).toBe('(min-width: 1152px)');
    expect(MOBILE_MEDIA).toBe('(max-width: 767px)');
  });
});

describe('call sites', () => {
  // `slot` is reserved by Astro for named-slot assignment: passing it to a
  // component drops the element instead of erroring, so the ad silently
  // disappears from every page where it is a direct child of the layout.
  it('never passes an ad id through a prop named `slot`', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.astro')) files.push(full);
      }
    };
    walk(new URL('../..', import.meta.url).pathname);

    expect(files.length).toBeGreaterThan(5);
    const offenders = files.filter((f) => /\bslot=\{AD_SLOTS\./.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

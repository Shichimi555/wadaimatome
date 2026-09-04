import { describe, it, expect } from 'vitest';
import { decodeEntities, extractReadableText, extractDescription, formatSources } from '../sources';

describe('decodeEntities', () => {
  it('decodes the named entities that show up in news pages', () => {
    expect(decodeEntities('A &amp; B &lt;C&gt; &quot;D&quot;&nbsp;E')).toBe('A & B <C> "D" E');
  });

  it('decodes numeric and hex references', () => {
    expect(decodeEntities('&#39;&#x3042;')).toBe("'あ");
  });

  it('leaves an entity it does not know alone', () => {
    expect(decodeEntities('&mdash;')).toBe('&mdash;');
  });
});

describe('extractReadableText', () => {
  it('drops scripts, styles and chrome', () => {
    const html = `
      <html><head><style>.a{color:red}</style></head>
      <body><nav>ホーム 検索</nav><script>var x = 1;</script>
      <p>福岡県議会で新たな証言。</p><footer>著作権</footer></body></html>`;
    const text = extractReadableText(html);
    expect(text).toContain('福岡県議会で新たな証言。');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('var x');
    expect(text).not.toContain('ホーム 検索');
    expect(text).not.toContain('著作権');
  });

  it('collapses whitespace and decodes entities', () => {
    expect(extractReadableText('<p>A &amp;\n\n   B</p>')).toBe('A & B');
  });
});

describe('extractDescription', () => {
  it('reads og:description in either attribute order', () => {
    expect(
      extractDescription('<meta property="og:description" content="要約です">')
    ).toBe('要約です');
    expect(
      extractDescription('<meta content="要約です" property="og:description">')
    ).toBe('要約です');
  });

  it('falls back to the plain description meta', () => {
    expect(extractDescription('<meta name="description" content="説明">')).toBe('説明');
  });

  it('returns empty when the page has neither', () => {
    expect(extractDescription('<html><body>本文</body></html>')).toBe('');
  });
});

describe('formatSources', () => {
  it('labels each source with its headline', () => {
    const out = formatSources([
      { title: '見出し1', url: 'https://a', text: '本文1' },
      { title: '見出し2', url: 'https://b', text: '本文2' },
    ]);
    expect(out).toBe('## 見出し1\n本文1\n\n## 見出し2\n本文2');
  });

  it('returns empty for no sources', () => {
    expect(formatSources([])).toBe('');
  });
});

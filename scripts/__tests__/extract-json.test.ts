import { describe, it, expect } from 'vitest';
import { extractJson } from '../extract-json';

describe('extractJson', () => {
  it('returns a bare object unchanged', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it('ignores prose around the object', () => {
    expect(extractJson('はい、こちらです:\n{"a":1}\nどうぞ')).toBe('{"a":1}');
  });

  it('stops at the end of the first object', () => {
    // The model sometimes writes a second object, or a closing note that
    // happens to contain a brace. A greedy match swallows both and JSON.parse
    // then dies on "unexpected non-whitespace character after JSON".
    expect(extractJson('{"a":1}\n{"b":2}')).toBe('{"a":1}');
  });

  it('keeps braces that live inside strings', () => {
    expect(extractJson('{"body":"## 見出し\\n\\n{ここ} は本文"}')).toBe(
      '{"body":"## 見出し\\n\\n{ここ} は本文"}'
    );
  });

  it('is not fooled by an escaped quote before a brace', () => {
    expect(extractJson('{"body":"言った\\"}\\" と"}')).toBe('{"body":"言った\\"}\\" と"}');
  });

  it('returns null when the object never closes', () => {
    expect(extractJson('{"title":"途中で切れた')).toBeNull();
  });

  it('returns null when there is no object at all', () => {
    expect(extractJson('メローニ首相は戦後最長政権を…')).toBeNull();
  });
});

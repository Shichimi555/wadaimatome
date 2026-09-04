import { describe, it, expect } from 'vitest';
import { createRotation } from '../models';

describe('createRotation', () => {
  it('cycles through the models', () => {
    const r = createRotation(['a', 'b', 'c']);
    const first = r.pick()!;
    const seen = [first, r.pick(), r.pick()];
    expect(new Set(seen)).toEqual(new Set(['a', 'b', 'c']));
    expect(r.pick()).toBe(first);
  });

  it('skips a retired model', () => {
    const r = createRotation(['a', 'b']);
    r.retire('a');
    expect(r.pick()).toBe('b');
    expect(r.pick()).toBe('b');
  });

  it('reports spent only once every model is retired', () => {
    const r = createRotation(['a', 'b']);
    r.retire('a');
    expect(r.spent).toBe(false);
    expect(r.pick()).not.toBeNull();
    r.retire('b');
    expect(r.spent).toBe(true);
    expect(r.pick()).toBeNull();
  });

  it('ignores a model retired twice', () => {
    const r = createRotation(['a', 'b']);
    r.retire('a');
    r.retire('a');
    expect(r.spent).toBe(false);
  });

  it('does not always start on the same model', () => {
    // A fixed start would send every run's first request to one model and spend
    // that budget at twice the rate of the other.
    const starts = new Set(Array.from({ length: 50 }, () => createRotation(['a', 'b']).pick()));
    expect(starts).toEqual(new Set(['a', 'b']));
  });
});

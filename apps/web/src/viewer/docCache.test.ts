import { describe, expect, it, vi } from 'vitest';
import { createDocCache } from './docCache';

const entry = () => ({
  doc: { numPages: 1, getPage: vi.fn(), destroy: vi.fn() },
  bytes: new Uint8Array(1),
});

describe('createDocCache', () => {
  it('evicts the least recently used document and destroys it', () => {
    const cache = createDocCache(3);
    const [a, b, c, d] = [entry(), entry(), entry(), entry()];
    cache.set('a', a);
    cache.set('b', b);
    cache.set('c', c);
    cache.get('a');
    cache.set('d', d);
    expect(b.doc.destroy).toHaveBeenCalledTimes(1);
    expect(a.doc.destroy).not.toHaveBeenCalled();
    expect(cache.peek('b')).toBeUndefined();
    expect(cache.peek('a')).toBe(a);
  });

  it('keeps the first entry when a path is set twice and destroys the newcomer', () => {
    const cache = createDocCache(3);
    const [a, again] = [entry(), entry()];
    cache.set('a', a);
    cache.set('a', again);
    expect(cache.peek('a')).toBe(a);
    expect(again.doc.destroy).toHaveBeenCalledTimes(1);
  });

  it('clear destroys everything', () => {
    const cache = createDocCache(3);
    const [a, b] = [entry(), entry()];
    cache.set('a', a);
    cache.set('b', b);
    cache.clear();
    expect(a.doc.destroy).toHaveBeenCalled();
    expect(b.doc.destroy).toHaveBeenCalled();
    expect(cache.peek('a')).toBeUndefined();
  });

  it('never evicts the protected (displayed) path', () => {
    const cache = createDocCache(3);
    const [a, b, c, d] = [entry(), entry(), entry(), entry()];
    cache.set('a', a);
    cache.set('b', b);
    cache.set('c', c);
    // 'a' is the oldest but on screen: 'b' goes instead
    cache.set('d', d, 'a');
    expect(a.doc.destroy).not.toHaveBeenCalled();
    expect(b.doc.destroy).toHaveBeenCalledTimes(1);
    expect(cache.peek('a')).toBe(a);
  });
});

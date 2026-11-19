import { describe, expect, it } from 'vitest';
import { returnPathFrom } from './returnPath';

describe('returnPathFrom', () => {
  it.each([
    ['/repertorios/r1', '/repertorios/r1'],
    ['/musicas/s1?tom=G&repertorio=r1&item=a', '/musicas/s1?tom=G&repertorio=r1&item=a'],
    ['/busca?q=sonda', '/busca?q=sonda'],
  ])('keeps an internal path (%s)', (from, expected) => {
    expect(returnPathFrom({ from })).toBe(expected);
  });

  it.each([
    ['no state', null],
    ['state without from', {}],
    ['from not a string', { from: 42 }],
    ['empty from', { from: '' }],
    ['protocol-relative //evil.com', { from: '//evil.com' }],
    ['absolute https://x', { from: 'https://x' }],
    ['backslash trick /\\evil.com', { from: '/\\evil.com' }],
    ['login itself', { from: '/login' }],
    ['login with query', { from: '/login?x=1' }],
  ])('falls back to home for %s', (_name, state) => {
    expect(returnPathFrom(state)).toBe('/');
  });
});

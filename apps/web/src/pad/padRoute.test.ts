import { describe, expect, it } from 'vitest';
import { padOwnerFor, padStaysOn, type PadOwner } from './padRoute';

const song: PadOwner = { kind: 'song', songId: 's1' };
const setlist: PadOwner = { kind: 'setlist', setlistId: 'r1' };

describe('padOwnerFor', () => {
  it('returns a song owner outside a setlist', () => {
    expect(padOwnerFor('s1', null)).toEqual({ kind: 'song', songId: 's1' });
  });

  it('returns a setlist owner inside a setlist', () => {
    expect(padOwnerFor('s1', 'r1')).toEqual({ kind: 'setlist', setlistId: 'r1' });
  });
});

describe('padStaysOn with a song owner', () => {
  it.each([
    ['/musicas/s1', '', true],
    ['/musicas/s1', '?tom=d', true],
    ['/musicas/s1', 'tom=d', true],
    ['/musicas/s1/', '', true],
    ['/musicas/s2', '', false],
    ['/musicas/s10', '', false],
    ['/musicas/s1/extra', '', false],
    ['/', '', false],
    ['/repertorios/r1', '', false],
    ['/musicas/s1', '?repertorio=r1', false],
  ])('%s %s -> %s', (path, search, expected) => {
    expect(padStaysOn(song, path, search)).toBe(expected);
  });
});

describe('padStaysOn with a setlist owner', () => {
  it.each([
    ['/musicas/x', '?repertorio=r1&item=i1', true],
    ['/musicas/x/', '?repertorio=r1', true],
    ['/repertorios/r1', '', true],
    ['/repertorios/r1/', '', true],
    ['/musicas/x', '', false],
    ['/musicas/x', '?repertorio=r2', false],
    ['/musicas/x/extra', '?repertorio=r1', false],
    ['/repertorios/r2', '', false],
    ['/repertorios/r10', '', false],
    ['/repertorios/r1/extra', '', false],
    ['/', '', false],
    ['/cantores/a', '', false],
    ['/pessoas', '', false],
  ])('%s %s -> %s', (path, search, expected) => {
    expect(padStaysOn(setlist, path, search)).toBe(expected);
  });
});

describe('padStaysOn on the Pad tab', () => {
  it('keeps any owner playing so the status screen can show and stop it', () => {
    expect(padStaysOn(song, '/pad', '')).toBe(true);
    expect(padStaysOn(setlist, '/pad', '')).toBe(true);
    expect(padStaysOn(song, '/pad/', '')).toBe(true);
    expect(padStaysOn(song, '/padx', '')).toBe(false);
    expect(padStaysOn(setlist, '/mais', '')).toBe(false);
  });
});

describe('padStaysOn with a free owner', () => {
  const free: PadOwner = { kind: 'free' };

  it.each([
    ['/musicas/s1', ''],
    ['/musicas/s2', '?repertorio=r1'],
    ['/repertorios/r1', ''],
    ['/', ''],
    ['/cantores/a', ''],
    ['/pessoas', ''],
    ['/padx', ''],
  ])('keeps playing on %s %s', (path, search) => {
    expect(padStaysOn(free, path, search)).toBe(true);
  });
});

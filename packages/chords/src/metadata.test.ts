import { describe, expect, it } from 'vitest';
import { findKeyIndicator } from './keyIndicator';
import { normalizeText, suggestMetadata } from './metadata';
import { line, run } from './__tests__/helpers';

const base = { fileName: 'x.pdf', knownArtists: [] as string[], firstChord: null, lastChord: null };

function titled(text: string, extra: Partial<Parameters<typeof suggestMetadata>[0]> = {}) {
  const lines = [line([run(text, 40)])];
  return suggestMetadata({
    ...base,
    lines,
    indicator: findKeyIndicator(lines),
    ...extra,
  });
}

describe('metadata', () => {
  it('normalizes text', () => {
    expect(normalizeText('  Sonda-me,   Usá-me! ')).toBe('sonda me usa me');
  });

  it('splits title and artist', () => {
    const s = titled('Sonda-me, Usa-me - Aline Barros (Bb)');
    expect(s).toMatchObject({
      title: 'Sonda-me, Usa-me',
      artist: 'Aline Barros',
      key: 'Bb',
      keySource: 'indicator',
      swapped: false,
    });
  });

  it('swaps when left side is a known artist', () => {
    const s = titled('Gabriela Rocha - Agnus Dei', { knownArtists: ['Gabriela Rocha'] });
    expect(s).toMatchObject({ title: 'Agnus Dei', artist: 'Gabriela Rocha', swapped: true });
  });

  it('keeps medley plus in title', () => {
    const s = titled('DEUS DOS DEUSES + HÁ UMA SAÍDA | DAMARIS ANDRADE');
    expect(s.title).toBe('DEUS DOS DEUSES + HÁ UMA SAÍDA');
    expect(s.artist).toBe('DAMARIS ANDRADE');
  });

  it('uses en dash separator', () => {
    const s = titled('João 20 + Pra Sempre – Josué Freitas');
    expect(s.title).toBe('João 20 + Pra Sempre');
    expect(s.artist).toBe('Josué Freitas');
  });

  it('keeps a title without artist', () => {
    expect(titled('Renova-me')).toMatchObject({ title: 'Renova-me', artist: '' });
  });

  it('reads key from filename', () => {
    expect(titled('Renova-me', { fileName: 'Renova-me - G.pdf' })).toMatchObject({
      key: 'G',
      keySource: 'filename',
    });
    expect(titled('Meu Prazer', { fileName: 'MEU PRAZER E-3.pdf' })).toMatchObject({
      key: 'E',
      keySource: 'filename',
    });
  });

  it('does not take a key from a title word in the filename', () => {
    const s = titled('Sonda-me', { fileName: 'Sonda-me, Usa-me - Aline Barros-2.pdf' });
    expect(s.key).toBeNull();
    expect(s.keySource).toBeNull();
  });

  it('infers key from chords when no indicator', () => {
    expect(titled('Renova-me', { firstChord: 'G', lastChord: 'Em' })).toMatchObject({
      key: 'Em',
      keySource: 'chords',
    });
    expect(titled('Renova-me', { firstChord: 'Dmaj7' })).toMatchObject({ key: 'D' });
  });

  it('prefers the Tom indicator over the filename', () => {
    const lines = [line([run('Meu Prazer', 40)]), line([run('Tom:', 40), run(' E', 80)], 1, 680)];
    const s = suggestMetadata({
      ...base,
      lines,
      fileName: 'Meu Prazer - G.pdf',
      indicator: findKeyIndicator(lines),
    });
    expect(s).toMatchObject({ title: 'Meu Prazer', key: 'E', keySource: 'indicator' });
  });

  it('skips chord lines and Tom lines when picking the title', () => {
    const lines = [
      line([run('Tom: E', 40)], 1, 720),
      line([run('E', 40), run('B', 100)], 1, 700),
      line([run('Meu Prazer', 40)], 1, 680),
    ];
    expect(suggestMetadata({ ...base, lines, indicator: null }).title).toBe('Meu Prazer');
  });

  it('falls back to file name when no title', () => {
    const s = suggestMetadata({
      ...base,
      lines: [],
      fileName: 'MEU PRAZER E-3.pdf',
      indicator: null,
    });
    expect(s.title).toBe('MEU PRAZER');
    const t = suggestMetadata({
      ...base,
      lines: [],
      fileName: 'Renova-me - G.pdf',
      indicator: null,
    });
    expect(t.title).toBe('Renova-me');
    expect(t.key).toBe('G');
  });
});

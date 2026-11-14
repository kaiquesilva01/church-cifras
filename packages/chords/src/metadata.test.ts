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

  describe('title assembly', () => {
    const noSpaces = (gap: number) => {
      const x2 = 40 + 27 * 6 + 8;
      const x3 = x2 + 6 + 8;
      const x4 = x3 + 4 * 6 + gap;
      return [
        line([
          run('Espírito Enche a Minha Vida', 40),
          run('–', x2),
          run('Arte', x3),
          run('Celebração', x4),
        ]),
      ];
    };

    it('inserts a space only where the x gap is real', () => {
      const real = suggestMetadata({ ...base, lines: noSpaces(5), indicator: null });
      expect(real).toMatchObject({
        title: 'Espírito Enche a Minha Vida',
        artist: 'Arte Celebração',
      });
      const tiny = suggestMetadata({ ...base, lines: noSpaces(0.5), indicator: null });
      expect(tiny.artist).toBe('ArteCelebração');
    });

    it('uses a non-bold title only when larger than the body and else the filename', () => {
      const text = 'O Medo Não Vai Me Parar - Sarah Beatriz';
      const lines = [
        line([{ ...run(text, 40, false), fontSize: 9 }], 1, 750),
        line([{ ...run('Letra da musica aqui', 40, false), fontSize: 9 }], 1, 730),
        line([{ ...run('Outra linha de letra', 40, false), fontSize: 9 }], 1, 710),
      ];
      const s = suggestMetadata({
        ...base,
        lines,
        fileName: 'O Medo Não Vai Me Parar - Sarah Beatriz.pdf',
        indicator: null,
      });
      expect(s).toMatchObject({ title: 'O Medo Não Vai Me Parar', artist: 'Sarah Beatriz' });
    });

    it('does not pick the first lyric line as title', () => {
      const lines = [
        line([{ ...run('Tom: E', 40, false), fontSize: 11 }], 1, 760),
        line([{ ...run('Primeira linha da letra', 40, false), fontSize: 11 }], 1, 740),
        line([{ ...run('Segunda linha da letra', 40, false), fontSize: 11 }], 1, 720),
      ];
      const s = suggestMetadata({
        ...base,
        lines,
        fileName: 'MEU PRAZER E-3.pdf',
        indicator: findKeyIndicator(lines),
      });
      expect(s).toMatchObject({ title: 'MEU PRAZER', key: 'E', keySource: 'indicator' });
    });

    it('takes a larger non-bold line as title', () => {
      const lines = [
        line([{ ...run('Grande Titulo', 40, false), fontSize: 16 }], 1, 760),
        line([{ ...run('letra', 40, false), fontSize: 10 }], 1, 740),
      ];
      expect(suggestMetadata({ ...base, lines, indicator: null }).title).toBe('Grande Titulo');
    });

    it('uses a bold line just below as the artist', () => {
      const lines = [
        line([run('DEUS DOS DEUSES + HÁ UMA SAÍDA', 40)], 1, 760),
        line([run('DAMARIS ANDRADE', 40)], 1, 748),
      ];
      expect(suggestMetadata({ ...base, lines, indicator: null })).toMatchObject({
        title: 'DEUS DOS DEUSES + HÁ UMA SAÍDA',
        artist: 'DAMARIS ANDRADE',
      });
    });

    it('swaps filename split with known artists', () => {
      const s = suggestMetadata({
        ...base,
        lines: [],
        fileName: 'Gabriela Rocha - Agnus Dei.pdf',
        knownArtists: ['Gabriela Rocha'],
        indicator: null,
      });
      expect(s).toMatchObject({ title: 'Agnus Dei', artist: 'Gabriela Rocha', swapped: true });
    });
  });
});

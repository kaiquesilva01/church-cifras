import { describe, expect, it } from 'vitest';
import type { KeyName } from '@cifras/chords';
import type { SongSummary } from '../catalog/types';
import { classifyRows, planImport, type BatchRow } from './batch';

let n = 0;
const row = (over: Partial<BatchRow> = {}): BatchRow => {
  n += 1;
  return {
    id: `r${n}`,
    fileName: `f${n}.pdf`,
    file: new File(['x'], `f${n}.pdf`),
    title: `Música ${n}`,
    artist: 'Cantor',
    key: 'G' as KeyName,
    chordCount: 10,
    suspects: [],
    ignoredChordLines: 0,
    lyrics: '',
    sizeOk: true,
    ...over,
  };
};

const song = (over: Partial<SongSummary> = {}): SongSummary => ({
  id: 's1',
  title: 'Grande Deus',
  titleNormalized: 'grande deus',
  artistId: 'cantor',
  artistName: 'Cantor',
  keys: ['G' as KeyName],
  handmadeKeys: ['G' as KeyName],
  ...over,
});

type Source = 'handmade' | 'generated' | null;
const emptyCatalog = {
  findSong: (): SongSummary | null => null,
  arrangementSource: (): Source => null,
};
const withSource = (source: Source) => ({
  findSong: (): SongSummary | null => song(),
  arrangementSource: (): Source => source,
});
const status = (r: BatchRow, catalog = emptyCatalog) => classifyRows([r], catalog)[0]!;

describe('classifyRows', () => {
  it('marks a plain new row as pronto', () => {
    expect(status(row()).status).toBe('pronto');
  });

  it('marks rows without chords as fora do padrão', () => {
    expect(status(row({ chordCount: 0 })).status).toBe('fora do padrão');
  });

  it('marks big files as grande demais', () => {
    expect(status(row({ sizeOk: false })).status).toBe('grande demais');
  });

  it('marks missing title, artist and key', () => {
    expect(status(row({ title: '  ' })).status).toBe('falta a música');
    expect(status(row({ artist: '' })).status).toBe('falta o cantor');
    expect(status(row({ key: null })).status).toBe('falta o tom');
  });

  it('marks second identical row as duplicado no lote', () => {
    const a = row({ title: 'Grande Deus', artist: 'Cantor' });
    const b = row({ title: 'grande  deus', artist: 'CANTOR' });
    const out = classifyRows([a, b], emptyCatalog);
    expect(out.map((r) => r.status)).toEqual(['pronto', 'duplicado no lote']);
  });

  it('does not treat a different key as duplicate', () => {
    const out = classifyRows(
      [row({ title: 'X', key: 'G' as KeyName }), row({ title: 'X', key: 'A' as KeyName })],
      emptyCatalog,
    );
    expect(out.map((r) => r.status)).toEqual(['pronto', 'pronto']);
  });

  it('does not count an earlier blocked row as the original', () => {
    const out = classifyRows(
      [row({ title: 'X', chordCount: 0 }), row({ title: 'X' })],
      emptyCatalog,
    );
    expect(out.map((r) => r.status)).toEqual(['fora do padrão', 'pronto']);
  });

  it('detects a handmade conflict, generated replacement and new key', () => {
    const r = row({ title: 'Grande Deus' });
    expect(status(r, withSource('handmade')).status).toBe('conflito: tom feito à mão já existe');
    expect(status(r, withSource('generated')).status).toBe('substitui gerado');
    expect(status(r, withSource(null)).status).toBe('já existe — novo tom');
  });

  it('applies the priority order', () => {
    const catalog = withSource('handmade');
    // Oversized files are not read, so their chord count is unknown (0): size wins.
    expect(status(row({ chordCount: 0, sizeOk: false, title: '' }), catalog).status).toBe(
      'grande demais',
    );
    expect(status(row({ chordCount: 0, title: '' }), catalog).status).toBe('fora do padrão');
    expect(status(row({ sizeOk: false, title: '' }), catalog).status).toBe('grande demais');
    expect(status(row({ title: '', key: null }), catalog).status).toBe('falta a música');
    const dup = classifyRows(
      [row({ title: 'Grande Deus' }), row({ title: 'Grande Deus' })],
      catalog,
    );
    expect(dup[0]!.status).toBe('conflito: tom feito à mão já existe');
    expect(dup[1]!.status).toBe('duplicado no lote');
  });

  it('keeps warnings apart from the blocking status', () => {
    const r = status(row({ suspects: ['Xyz', 'Q'], ignoredChordLines: 3 }));
    expect(r.status).toBe('pronto');
    expect(r.warnings).toEqual(['revisar: Xyz, Q', 'linhas de acorde ignoradas: 3']);
  });

  it('classifies against an updated catalog after a partial import', () => {
    const r = row({ title: 'Grande Deus' });
    expect(status(r).status).toBe('pronto');
    expect(status(r, withSource('handmade')).status).toBe('conflito: tom feito à mão já existe');
  });
});

describe('planImport', () => {
  it('groups rows of the same song in order and skips non importable', () => {
    const rows = classifyRows(
      [
        row({ id: 'a1', title: 'A', key: 'G' as KeyName }),
        row({ id: 'b1', title: 'B' }),
        row({ id: 'x', title: 'C', chordCount: 0 }),
        row({ id: 'a2', title: 'a', key: 'A' as KeyName }),
      ],
      emptyCatalog,
    );
    const groups = planImport(rows);
    expect(groups.map((g) => g.rows.map((r) => r.id))).toEqual([['a1', 'a2'], ['b1']]);
    expect(groups[0]!.identity).toBe('a|cantor');
  });
});

describe('unreadable pdf', () => {
  it('is fora do padrão with its own detail', () => {
    const [result] = classifyRows(
      [row({ readError: 'não foi possível ler o PDF', chordCount: 0 })],
      emptyCatalog,
    );
    expect(result!.status).toBe('fora do padrão');
    expect(result!.detail).toBe('não foi possível ler o PDF');
  });
});

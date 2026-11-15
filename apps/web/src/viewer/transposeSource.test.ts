import type { KeyName } from '@cifras/chords';
import { describe, expect, it } from 'vitest';
import { pickTransposeSource } from './transposeSource';
import type { ArrangementView } from './useSongArrangements';

const view = (
  key: KeyName,
  source: 'handmade' | 'generated',
  derivedFromKey: KeyName | null = null,
): ArrangementView => ({
  key,
  slug: key.replace('#', 's'),
  source,
  storagePath: `songs/s1/${key}.pdf`,
  derivedFromKey,
  collisions: 0,
});

describe('pickTransposeSource', () => {
  it('uses the open key when it is handmade', () => {
    const list = [view('G', 'handmade'), view('A', 'handmade')];
    expect(pickTransposeSource(list, 'A')?.key).toBe('A');
  });

  it('uses derivedFromKey when the open key is generated', () => {
    const list = [view('C', 'handmade'), view('G', 'handmade'), view('A', 'generated', 'G')];
    expect(pickTransposeSource(list, 'A')?.key).toBe('G');
  });

  it('falls back to the first handmade when derivedFromKey is missing or not handmade', () => {
    const list = [
      view('D', 'handmade'),
      view('G', 'handmade'),
      view('A', 'generated', 'B'),
      view('B', 'generated', 'G'),
    ];
    expect(pickTransposeSource(list, 'A')?.key).toBe('D');
    expect(pickTransposeSource([...list].reverse(), null)?.key).toBe('D');
    expect(pickTransposeSource(list, 'F')?.key).toBe('D');
  });

  it('returns null without a handmade arrangement', () => {
    expect(pickTransposeSource([view('A', 'generated', 'G')], 'A')).toBeNull();
    expect(pickTransposeSource([], null)).toBeNull();
  });
});

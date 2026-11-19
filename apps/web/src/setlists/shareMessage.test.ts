import { describe, expect, it } from 'vitest';
import { makeSong } from '../test/fakeCatalogApi';
import type { SetlistItem } from './types';
import { buildShareMessage, resolveShareLines } from './shareMessage';

const link = 'https://cifras.example/repertorios/r1';

describe('buildShareMessage', () => {
  it('builds the header, a numbered list with keys and the link', () => {
    const text = buildShareMessage({
      label: 'Culto de domingo',
      date: '2026-11-20',
      items: [
        { title: 'Sonda-me', key: 'G' },
        { title: 'Ressuscita-me', key: 'F#m' },
      ],
      link,
    });
    expect(text).toBe(
      ['🎵 *Culto de domingo* — 20/11', '1. Sonda-me (G)', '2. Ressuscita-me (F#m)', link].join(
        '\n',
      ),
    );
  });

  it('handles a single louvor', () => {
    const text = buildShareMessage({
      label: 'Culto',
      date: '2026-01-04',
      items: [{ title: 'Grande é o Senhor', key: 'D' }],
      link,
    });
    expect(text).toBe(['🎵 *Culto* — 04/01', '1. Grande é o Senhor (D)', link].join('\n'));
  });

  it('keeps only the header and the link when the setlist is empty', () => {
    const text = buildShareMessage({ label: 'Culto', date: '2026-11-20', items: [], link });
    expect(text).toBe(['🎵 *Culto* — 20/11', link].join('\n'));
  });

  it('keeps special characters in the label, but drops asterisks that would break WhatsApp bold', () => {
    const text = buildShareMessage({
      label: 'Culto *especial* — 1ª & "Noite" (vigília)',
      date: '2026-11-20',
      items: [{ title: 'Sonda-me', key: 'G' }],
      link,
    });
    expect(text.split('\n')[0]).toBe('🎵 *Culto especial — 1ª & "Noite" (vigília)* — 20/11');
  });

  it('falls back to the default title when the label is empty after cleaning', () => {
    const text = buildShareMessage({ label: '**', date: '2026-11-20', items: [], link });
    expect(text.split('\n')[0]).toBe('🎵 *Repertório* — 20/11');
  });

  it('drops asterisks from song titles too, but keeps _ and ~', () => {
    const text = buildShareMessage({
      label: 'Culto',
      date: '2026-11-20',
      items: [{ title: '*Sonda* me_ ~já~', key: 'G' }],
      link,
    });
    expect(text.split('\n')[1]).toBe('1. Sonda me_ ~já~ (G)');
  });
});

describe('resolveShareLines', () => {
  const songs = new Map([
    ['s1', makeSong({ id: 's1', title: 'Sonda-me' })],
    ['s2', makeSong({ id: 's2', title: 'Ressuscita-me' })],
  ]);
  const item = (id: string, songId: string, key: string): SetlistItem => ({ id, songId, key });

  it('uses the catalog title and the item key, in order', () => {
    expect(resolveShareLines([item('a', 's1', 'G'), item('b', 's2', 'F#m')], songs)).toEqual([
      { title: 'Sonda-me', key: 'G' },
      { title: 'Ressuscita-me', key: 'F#m' },
    ]);
  });

  it('drops songs that left the catalog, so the numbering stays continuous', () => {
    const lines = resolveShareLines(
      [item('a', 's1', 'G'), item('x', 'gone', 'C'), item('b', 's2', 'F#m')],
      songs,
    );
    expect(lines).toEqual([
      { title: 'Sonda-me', key: 'G' },
      { title: 'Ressuscita-me', key: 'F#m' },
    ]);
    const text = buildShareMessage({ label: 'Culto', date: '2026-11-20', items: lines, link });
    expect(text).toContain('\n1. Sonda-me (G)\n2. Ressuscita-me (F#m)\n');
    expect(text).not.toContain('3.');
  });
});

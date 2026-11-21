import { describe, expect, it } from 'vitest';
import { PAD_SAMPLES, padNoteFor, type PadNote } from './padNotes';

const BAR = 240 / 70;

const EXPECTED: [PadNote, string, number][] = [
  ['C', 'DS04-C', 8],
  ['C#', 'DS05-Cs', 7],
  ['D', 'DS06-D', 6],
  ['D#', 'DS07-Ds', 5],
  ['E', 'DS08-E', 6],
  ['F', 'DS09-F', 7],
  ['F#', 'DS10-Fs', 7],
  ['G', 'DS11-G', 4],
  ['G#', 'DS12-Gs', 5],
  ['A', 'DS01-A', 4],
  ['A#', 'DS02-As', 6],
  ['B', 'DS03-B', 7],
];

describe('padNoteFor', () => {
  it.each([
    ['C', 'C'],
    ['C#', 'C#'],
    ['Db', 'C#'],
    ['D', 'D'],
    ['D#', 'D#'],
    ['Eb', 'D#'],
    ['E', 'E'],
    ['F', 'F'],
    ['F#', 'F#'],
    ['Gb', 'F#'],
    ['G', 'G'],
    ['G#', 'G#'],
    ['Ab', 'G#'],
    ['A', 'A'],
    ['A#', 'A#'],
    ['Bb', 'A#'],
    [' bb', 'A#'],
    ['B', 'B'],
    ['Am', 'C'],
    ['Em', 'G'],
    ['F#m', 'A'],
    ['Bm', 'D'],
    ['Dm', 'F'],
    ['C#m', 'E'],
    ['Gm', 'A#'],
  ])('maps %s to %s', (key, note) => {
    expect(padNoteFor(key)).toBe(note);
  });

  it('returns null for invalid keys', () => {
    expect(padNoteFor('H')).toBeNull();
    expect(padNoteFor('')).toBeNull();
  });
});

describe('PAD_SAMPLES', () => {
  it.each(EXPECTED)('%s uses %s with %i intro bars', (note, file, introBars) => {
    const s = PAD_SAMPLES[note];
    expect(s.note).toBe(note);
    expect(s.storagePath).toBe(`pads/v1/${file}.m4a`);
    expect(s.introBars).toBe(introBars);
    expect(s.loopStartSec).toBeCloseTo(introBars * BAR, 6);
    expect(s.loopEndSec - s.loopStartSec).toBeCloseTo(16 * BAR, 6);
  });

  it('has 12 distinct versioned storage paths', () => {
    const samples = Object.values(PAD_SAMPLES);
    expect(samples).toHaveLength(12);
    expect(new Set(samples.map((s) => s.storagePath)).size).toBe(12);
    for (const s of samples) expect(s.storagePath).toMatch(/^pads\/v\d+\/DS\d\d-[A-G]s?\.m4a$/);
  });
});

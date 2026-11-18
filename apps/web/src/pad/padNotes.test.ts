import { describe, expect, it } from 'vitest';
import { BAR_SEC, LOOP_BARS, PAD_SAMPLES, padNoteFor, type PadNote } from './padNotes';

describe('padNoteFor', () => {
  it.each([
    ['Bb', 'A#'],
    ['Eb', 'D#'],
    ['Ab', 'G#'],
    ['Am', 'A'],
    ['F#m', 'F#'],
    ['C', 'C'],
  ])('maps %s to %s', (key, note) => {
    expect(padNoteFor(key)).toBe(note);
  });

  it('returns null for invalid keys', () => {
    expect(padNoteFor('H')).toBeNull();
    expect(padNoteFor('')).toBeNull();
  });
});

describe('PAD_SAMPLES', () => {
  const samples = Object.values(PAD_SAMPLES);

  it('has 12 distinct storage paths under pads/', () => {
    expect(samples).toHaveLength(12);
    expect(new Set(samples.map((s) => s.storagePath)).size).toBe(12);
    for (const s of samples) expect(s.storagePath.startsWith('pads/')).toBe(true);
  });

  it('computes loop points from introBars', () => {
    for (const s of samples) {
      expect(s.loopEndSec - s.loopStartSec).toBeCloseTo(54.857, 3);
      expect(s.loopStartSec).toBeCloseTo((s.introBars * 240) / 70, 6);
    }
    expect(LOOP_BARS).toBe(16);
    expect(BAR_SEC).toBeCloseTo(240 / 70, 10);
  });

  it('keys each sample by its note', () => {
    for (const [note, s] of Object.entries(PAD_SAMPLES)) expect(s.note).toBe(note as PadNote);
    expect(PAD_SAMPLES.C.storagePath).toBe('pads/DS04-C.m4a');
  });
});

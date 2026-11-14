import { buildTransposePlan, findKeyIndicator, parseKey } from '@cifras/chords';
import type { Measure } from '@cifras/chords';
import { describe, expect, it } from 'vitest';
import { readTextLines } from '../src/readTextLines';
import { buildSyntheticPdf } from './synthetic';
import type { SyntheticLine } from './synthetic';

const measure: Measure = (text, fontName, fontSize) =>
  text.length * (/courier/i.test(fontName) ? 0.6 : 0.55) * fontSize;

const lines: SyntheticLine[] = [
  {
    chords: [
      [40, 'A#'],
      [140, 'F/A'],
      [240, 'Gm'],
    ],
    lyric: 'Luz do amanhecer sobre a serra',
  },
  {
    chords: [
      [40, 'Gm7/F'],
      [140, 'D#'],
    ],
    lyric: 'Rio de prata sem fim',
  },
];

function key(name: string) {
  const parsed = parseKey(name);
  if (!parsed) throw new Error(name);
  return parsed;
}

describe('readTextLines', () => {
  it('reads runs with bold detection and positions', async () => {
    const data = await buildSyntheticPdf({
      title: 'Cancao Inventada',
      keyStyle: 'none',
      chordFont: 'CourierBold',
      lyricFont: 'Courier',
      lines,
    });
    const result = await readTextLines(data);
    const all = result.flatMap((l) => l.runs);
    const chord = all.find((r) => r.text.trim() === 'Gm7/F');
    const lyric = all.find((r) => r.text.includes('Rio de prata'));
    expect(chord?.bold).toBe(true);
    expect(chord?.fontName).toMatch(/Courier-Bold/);
    expect(lyric?.bold).toBe(false);
    expect(chord?.x).toBeCloseTo(40, 0);
    expect(chord?.fontSize).toBeCloseTo(10, 0);
    expect(result[0]?.page).toBe(1);
    expect(result[0]?.pageWidth).toBeCloseTo(595, 0);
  });

  it('end to end: synthetic mono pdf transposes Bb to D', async () => {
    const data = await buildSyntheticPdf({
      title: 'Cancao Inventada',
      keyStyle: 'paren',
      key: 'Bb',
      chordFont: 'CourierBold',
      lyricFont: 'Courier',
      lines,
    });
    const result = await readTextLines(data);
    const indicator = findKeyIndicator(result);
    expect(indicator?.kind).toBe('title');
    expect(indicator?.token.text).toBe('(Bb)');
    const plan = buildTransposePlan({ lines: result, from: key('Bb'), to: key('D'), measure });
    expect(plan.chords.map((c) => [c.original, c.replacement])).toEqual([
      ['A#', 'D'],
      ['F/A', 'A/C#'],
      ['Gm', 'Bm'],
      ['Gm7/F', 'Bm7/A'],
      ['D#', 'G'],
    ]);
  });

  it('end to end: proportional font with Tom indicator', async () => {
    const data = await buildSyntheticPdf({
      title: 'Cancao Inventada',
      keyStyle: 'tom',
      key: 'E',
      chordFont: 'HelveticaBold',
      lyricFont: 'Helvetica',
      lines: [
        {
          chords: [
            [40, 'E'],
            [200, 'A'],
          ],
          lyric: 'Passaros cantam ao sol',
        },
      ],
    });
    const result = await readTextLines(data);
    const indicator = findKeyIndicator(result);
    expect(indicator?.kind).toBe('tom');
    expect(indicator?.key.name).toBe('E');
    const plan = buildTransposePlan({ lines: result, from: key('E'), to: key('F#'), measure });
    expect(plan.chords.map((c) => c.replacement)).toEqual(['F#', 'B']);
  });

  it('merges split chord fragments from pdf', async () => {
    const data = await buildSyntheticPdf({
      title: 'Cancao Inventada',
      keyStyle: 'none',
      chordFont: 'CourierBold',
      lyricFont: 'Courier',
      splitChord: 'Bm7',
      lines: [{ chords: [[40, 'Bm7']], lyric: 'Montanha de luz' }],
    });
    const result = await readTextLines(data);
    const plan = buildTransposePlan({ lines: result, from: key('Bm'), to: key('Cm'), measure });
    expect(plan.chords.map((c) => [c.original, c.replacement])).toEqual([['Bm7', 'Cm7']]);
  });
});

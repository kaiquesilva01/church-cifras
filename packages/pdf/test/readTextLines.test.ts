import { buildTransposePlan, findKeyIndicator, parseKey } from '@cifras/chords';
import type { Measure } from '@cifras/chords';
import { describe, expect, it } from 'vitest';
import {
  getPdfjs,
  readTextLines,
  readTextLinesFromDocument,
  resolveFontName,
} from '../src/readTextLines';
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

  it('transposes chords in both columns of a two-column page', async () => {
    const data = await buildSyntheticPdf({
      title: 'Cancao Inventada',
      keyStyle: 'none',
      chordFont: 'CourierBold',
      lyricFont: 'Courier',
      twoColumns: true,
      lines: [
        { chords: [[40, 'C']], lyric: 'Primeira coluna' },
        { chords: [[40, 'G']], lyric: 'Ainda a primeira' },
        { chords: [[40, 'Am']], lyric: 'Segunda coluna' },
        { chords: [[40, 'F']], lyric: 'Ainda a segunda' },
      ],
    });
    const result = await readTextLines(data);
    const plan = buildTransposePlan({ lines: result, from: key('C'), to: key('D'), measure });
    expect(plan.chords.map((c) => c.replacement).sort()).toEqual(['A', 'Bm', 'D', 'G']);
    expect(plan.chords.some((c) => c.x > 300)).toBe(true);
  });

  it('exposes font metrics and the user-space page width', async () => {
    const data = await buildSyntheticPdf({
      title: 'Cancao Inventada',
      keyStyle: 'none',
      chordFont: 'CourierBold',
      lyricFont: 'Helvetica',
      lines,
    });
    const read = await readTextLines(data);
    for (const run of read.flatMap((l) => l.runs)) {
      expect(run.ascent).toBeGreaterThan(0.5);
      expect(run.ascent).toBeLessThan(1.2);
      expect(run.descent).toBeLessThan(0);
      expect(run.descent).toBeGreaterThan(-0.5);
    }
    expect(read[0]!.pageWidth).toBe(595);
  });

  it('reads an already opened document with the shared pdf.js instance', async () => {
    const data = await buildSyntheticPdf({
      title: 'Cancao Inventada',
      keyStyle: 'none',
      chordFont: 'CourierBold',
      lyricFont: 'Helvetica',
      lines,
    });
    const task = getPdfjs().getDocument({
      data: data.slice(),
      verbosity: 0,
      fontExtraProperties: true,
    });
    const doc = await task.promise;
    try {
      const fromDoc = await readTextLinesFromDocument(doc);
      expect(fromDoc).toEqual(await readTextLines(data));
      expect(fromDoc.some((l) => l.runs.some((r) => r.bold))).toBe(true);
    } finally {
      await task.destroy();
    }
  });
});

describe('resolveFontName', () => {
  it('waits for the callback when the font is not loaded yet', async () => {
    const commonObjs = {
      get(id: string, callback?: (font: unknown) => void) {
        if (!callback) throw new Error(`Requesting object that isn't resolved yet ${id}`);
        setTimeout(() => callback({ name: 'ABCDEF+Cifra-Bold' }), 5);
      },
    };
    expect(await resolveFontName(commonObjs, 'g_d0_f1')).toBe('Cifra-Bold');
  });

  it('falls back to the synchronous get after the timeout', async () => {
    const commonObjs = {
      get(_id: string, callback?: (font: unknown) => void) {
        return callback ? undefined : { name: 'Plain-Regular' };
      },
    };
    expect(await resolveFontName(commonObjs, 'g_d0_f2', 10)).toBe('Plain-Regular');
  });

  it('falls back to the id when nothing resolves', async () => {
    const commonObjs = {
      get(): never {
        throw new Error('nope');
      },
    };
    expect(await resolveFontName(commonObjs, 'g_d0_f3', 10)).toBe('g_d0_f3');
  });
});

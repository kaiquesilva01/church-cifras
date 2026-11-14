import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { buildTransposePlan, findKeyIndicator, parseKey } from '@cifras/chords';
import { readTextLines } from '@cifras/pdf';
import { describe, expect, it } from 'vitest';
import { createMeasure } from '../src/measure';
import { overlayOps } from '../src/ops';
import { createOverlayWriter, createRewriteWriter } from '../src/index';
import { buildSyntheticPdf } from '../../pdf/test/synthetic';
import { expectOpsWritten, loadAllFonts, loadFontFromDisk } from './helpers';

const key = (name: string) => parseKey(name)!;

describe('overlay writer', () => {
  it('round-trip: written pdf contains new chords at the planned positions', async () => {
    const original = await buildSyntheticPdf({
      title: 'Cancao Inventada',
      keyStyle: 'tom',
      key: 'Bb',
      chordFont: 'CourierBold',
      lyricFont: 'Courier',
      lines: [
        {
          chords: [
            [40, 'Bb'],
            [140, 'F/A'],
            [240, 'Gm'],
          ],
          lyric: 'Luz do amanhecer sobre a serra',
        },
        {
          chords: [
            [40, 'Eb'],
            [140, 'Cm7'],
          ],
          lyric: 'Rio de prata sem fim',
        },
      ],
    });
    const measure = createMeasure(await loadAllFonts());
    const plan = buildTransposePlan({
      lines: await readTextLines(original),
      from: key('Bb'),
      to: key('D'),
      measure,
    });
    expect(plan.chords.map((c) => c.replacement)).toEqual(['D', 'A/C#', 'Bm', 'G', 'Em7']);
    expect(plan.keyIndicator?.replacement).toBe('D');

    const written = await createOverlayWriter(loadFontFromDisk).write(original, plan);
    const lines = await readTextLines(written);
    expectOpsWritten(lines, overlayOps(plan), measure);
    // the original document is untouched
    const originalRuns = (await readTextLines(original)).flatMap((l) => l.runs);
    expect(originalRuns.some((r) => r.text === 'Bb')).toBe(true);
  });

  it('keeps the page count and size', async () => {
    const original = await buildSyntheticPdf({
      title: 'X',
      keyStyle: 'none',
      chordFont: 'HelveticaBold',
      lyricFont: 'Helvetica',
      lines: [{ chords: [[40, 'C']], lyric: 'texto' }],
    });
    const plan = buildTransposePlan({
      lines: await readTextLines(original),
      from: key('C'),
      to: key('D'),
      measure: createMeasure(await loadAllFonts()),
    });
    const written = await createOverlayWriter(loadFontFromDisk).write(original, plan);
    const doc = await PDFDocument.load(written);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
  });

  it('rewrite writer is not available', async () => {
    const writer = createRewriteWriter();
    await expect(writer.write(new Uint8Array(), {} as never)).rejects.toThrow(
      'Modo de reescrita ainda não disponível.',
    );
  });
});

const privateDir = resolve(import.meta.dirname, '../../../fixtures/private');
const files = existsSync(privateDir)
  ? readdirSync(privateDir).filter((f) => f.toLowerCase().endsWith('.pdf'))
  : [];

describe.skipIf(files.length === 0)('real fixtures', () => {
  it.each(files)('%s', async (file) => {
    const data = new Uint8Array(readFileSync(resolve(privateDir, file)));
    const lines = await readTextLines(data);
    const measure = createMeasure(await loadAllFonts());
    const indicator = findKeyIndicator(lines, measure);
    const from = indicator?.key ?? key('C');
    const to = key(from.minor ? 'Dm' : 'D');
    const plan = buildTransposePlan({ lines, from, to, measure });
    expect(plan.chordCount).toBeGreaterThan(0);

    const written = await createOverlayWriter(loadFontFromDisk).write(data, plan);
    const outDir = resolve(privateDir, 'out');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, `${file.replace(/\.pdf$/i, '')} → D.pdf`), written);

    const ops = overlayOps(plan);
    // packed groups that collide are reflowed into one op, so there are never more ops than chords
    expect(ops.length).toBeLessThanOrEqual(plan.chords.length + (plan.keyIndicator ? 1 : 0));
    expect(ops.length).toBeGreaterThan(0);
    expectOpsWritten(await readTextLines(written), ops, measure);
  });
});

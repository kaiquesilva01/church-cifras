import { PDFDocument } from 'pdf-lib';
import * as fontkit from '@pdf-lib/fontkit';
import { describe, expect, it } from 'vitest';
import { createMeasure } from '../src/measure';
import { loadAllFonts, loadFontFromDisk } from './helpers';

describe('createMeasure', () => {
  it('measures with real font metrics', async () => {
    const measure = createMeasure(await loadAllFonts());
    // Liberation Mono advance is 1229/2048 em = 0.6001 em
    expect(Math.abs(measure('Gm7', 'CourierNewPS-BoldMT', 10) - 18)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(measure('Gm7', 'Courier', 10) - 18)).toBeLessThanOrEqual(0.01);
  });

  it('selects the font from the name: bold and regular differ in sans', async () => {
    const measure = createMeasure(await loadAllFonts());
    expect(measure('Abmaj7', 'Arial-BoldMT', 12)).toBeGreaterThan(measure('Abmaj7', 'ArialMT', 12));
  });

  it('matches the width pdf-lib reports for the embedded font', async () => {
    const measure = createMeasure(await loadAllFonts());
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const embedded = await doc.embedFont(await loadFontFromDisk('sans-bold'), { subset: true });
    for (const text of ['D', 'A/C#', 'F#m7(b5)/C', 'Bbmaj7']) {
      expect(measure(text, 'Arial-BoldMT', 11.5)).toBeCloseTo(
        embedded.widthOfTextAtSize(text, 11.5),
        6,
      );
    }
  });

  it('measure falls back for unloaded fonts', () => {
    const warnings: string[] = [];
    const measure = createMeasure(new Map(), (message) => warnings.push(message));
    // 0.6 em per char: 3 chars at 10pt
    expect(measure('Gm7', 'Arial-BoldMT', 10)).toBeCloseTo(18, 6);
    expect(measure('Gm7', 'Arial-BoldMT', 10)).toBeCloseTo(18, 6);
    // one warning per missing font, not per call
    expect(warnings).toEqual(['Fonte não carregada: sans-bold; largura estimada.']);
    expect(() => createMeasure(new Map())('A', 'Courier', 10)).not.toThrow();
  });
});

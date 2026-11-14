import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as fontkit from '@pdf-lib/fontkit';
import type { Measure, TextLine } from '@cifras/chords';
import { expect } from 'vitest';
import { FONT_FILES } from '../src/fonts';
import type { FontId } from '../src/fonts';
import type { LoadedFonts } from '../src/measure';
import type { OverlayOp } from '../src/ops';

const fontsDir = resolve(import.meta.dirname, '../fonts');

export const loadFontFromDisk = async (id: FontId): Promise<Uint8Array> =>
  new Uint8Array(readFileSync(resolve(fontsDir, FONT_FILES[id])));

export async function loadAllFonts(): Promise<LoadedFonts> {
  const fonts: LoadedFonts = new Map();
  for (const id of Object.keys(FONT_FILES) as FontId[]) {
    fonts.set(id, fontkit.create(await loadFontFromDisk(id)));
  }
  return fonts;
}

const SUBSTITUTE = /Liberation|Roboto/;
const MERGE_SLACK_EM = 0.6;

// pdf.js merges neighbouring chunks of the same font into one item ("A/C#G9"), so the op's text is
// searched inside each substitute-font run and its x is rebuilt from the measured prefix width.
const originalFamily = (fontName: string): string => {
  const family = /LiberationMono/.test(fontName)
    ? 'Courier'
    : /LiberationSans/.test(fontName)
      ? 'Arial'
      : /RobotoMono/.test(fontName)
        ? 'RobotoMono'
        : 'Roboto';
  return /Bold/.test(fontName) ? `${family}-Bold` : family;
};

// Every op's text must appear in the written PDF, in a substitute font, at the planned position.
export function expectOpsWritten(lines: TextLine[], ops: OverlayOp[], measure: Measure): void {
  for (const op of ops) {
    const found = lines
      .filter((l) => l.page === op.page)
      .flatMap((l) => l.runs)
      .some((r) => {
        if (!SUBSTITUTE.test(r.fontName) || Math.abs(r.y - op.text.y) > 0.5) return false;
        const name = originalFamily(r.fontName);
        for (
          let at = r.text.indexOf(op.text.value);
          at >= 0;
          at = r.text.indexOf(op.text.value, at + 1)
        ) {
          const x = r.x + measure(r.text.slice(0, at), name, r.fontSize);
          // pdf.js also injects a synthetic space for gaps inside a merged item, so allow its slack
          if (Math.abs(x - op.text.x) <= (at === 0 ? 0.5 : MERGE_SLACK_EM * r.fontSize))
            return true;
        }
        return false;
      });
    expect(found, `"${op.text.value}" at ${op.text.x},${op.text.y} p${op.page}`).toBe(true);
  }
}

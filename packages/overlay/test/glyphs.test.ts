import * as fontkit from '@pdf-lib/fontkit';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { FONT_FILES, createOverlayWriter } from '../src/index';
import type { FontId } from '../src/index';
import { loadFontFromDisk } from './helpers';
import { buildSyntheticPdf } from '../../pdf/test/synthetic';
import { parseKey } from '@cifras/chords';
import type { Replacement, TransposePlan } from '@cifras/chords';

const CHARSET = 'ABCDEFG#bm0123456789()/+-°ºø:';

function replacementOf(fontName: string, bold: boolean, text: string): Replacement {
  return {
    page: 1,
    x: 40,
    y: 700,
    width: 10,
    fontSize: 12,
    fontName,
    ascent: 0.9,
    descent: -0.2,
    bold,
    original: 'x',
    replacement: text,
    newWidth: 10,
    collides: false,
    runKey: '1:700:40',
    spaceWidth: 6,
    limitX: 580,
  };
}

const NAMES: Record<FontId, [string, boolean]> = {
  'mono-bold': ['Courier-Bold', true],
  'mono-regular': ['Courier', false],
  'sans-bold': ['Arial-BoldMT', true],
  'sans-regular': ['ArialMT', false],
  'roboto-bold': ['Roboto-Bold', true],
  'roboto-regular': ['Roboto', false],
  'robotomono-bold': ['RobotoMono-Bold', true],
  'robotomono-regular': ['RobotoMono', false],
};

describe('embedded glyphs', () => {
  it.each(Object.keys(FONT_FILES) as FontId[])(
    'embeds every chord glyph and draws it (%s)',
    async (id) => {
      const [fontName, bold] = NAMES[id];
      const base = await buildSyntheticPdf({
        title: 'X',
        keyStyle: 'none',
        chordFont: 'CourierBold',
        lyricFont: 'Courier',
        lines: [],
      });
      const plan: TransposePlan = {
        from: parseKey('C')!,
        to: parseKey('D')!,
        chords: [replacementOf(fontName, bold, CHARSET)],
        keyIndicator: null,
        chordCount: 1,
        collisions: 0,
        suspectSegments: [],
        ignoredChordLines: 0,
      };
      const out = await PDFDocument.load(
        await createOverlayWriter(loadFontFromDisk).write(base, plan),
      );

      // the substitute's font program (FontFile2) as embedded in the output
      const programs: Uint8Array[] = [];
      for (const [, obj] of out.context.enumerateIndirectObjects()) {
        if (obj instanceof PDFDict && obj.has(PDFName.of('FontFile2'))) {
          const stream = out.context.lookup(
            obj.get(PDFName.of('FontFile2')) as PDFRef,
          ) as PDFRawStream;
          programs.push(decodePDFRawStream(stream).decode());
        }
      }
      expect(programs).toHaveLength(1);
      const embedded = fontkit.create(programs[0]!);

      // gids written to the page content (Identity-H hex strings)
      const contents = out.getPage(0).node.Contents();
      const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
      const text = refs
        .map((r) => decodePDFRawStream(out.context.lookup(r as PDFRef) as PDFRawStream).decode())
        .map((b) => Buffer.from(b).toString('latin1'))
        .join('\n');
      const hex = [...text.matchAll(/<([0-9A-Fa-f]{4,})>\s*Tj/g)].map((m) => m[1]!).join('');
      const drawn = hex.match(/.{4}/g)!.map((h) => parseInt(h, 16));

      const codePoints = [...CHARSET].map((c) => c.codePointAt(0)!);
      expect(drawn).toHaveLength(codePoints.length);
      codePoints.forEach((cp, i) => {
        const glyph = embedded.glyphForCodePoint(cp);
        const label = `U+${cp.toString(16)} (${String.fromCodePoint(cp)}) in ${id}`;
        expect(glyph.id, label).not.toBe(0);
        expect(
          (glyph.path as unknown as { commands: unknown[] }).commands.length,
          `${label} has an outline`,
        ).toBeGreaterThan(0);
        expect(drawn[i], `${label} is the glyph drawn`).toBe(glyph.id);
      });
    },
  );
});

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as fontkit from '@pdf-lib/fontkit';
import { describe, expect, it } from 'vitest';
import { FONT_FILES } from '../src/fonts';
import type { FontId } from '../src/fonts';
import { SUBSET_CHARSET } from '../scripts/charset.mjs';

const fontsDir = resolve(import.meta.dirname, '../fonts');
const ids = Object.keys(FONT_FILES) as FontId[];

// Whitespace-like code points are mapped to real glyphs but legitimately draw nothing.
const BLANK = new Set([0x20, 0xa0, 0xad]);

const expectedCharset =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#()/+-°ºø:[]|.,; '" +
  Array.from({ length: 0x100 - 0xa0 }, (_, i) => String.fromCodePoint(0xa0 + i)).join('') +
  '–—…';

describe('subset substitute fonts', () => {
  it('uses the agreed charset', () => {
    expect(SUBSET_CHARSET).toBe(expectedCharset);
  });

  it.each(ids)('subset fonts cover the chord charset (%s)', (id) => {
    const font = fontkit.create(new Uint8Array(readFileSync(resolve(fontsDir, FONT_FILES[id]))));
    for (const ch of SUBSET_CHARSET) {
      const cp = ch.codePointAt(0)!;
      const glyph = font.glyphForCodePoint(cp);
      const label = `U+${cp.toString(16)} (${ch}) in ${id}`;
      expect(glyph.id, label).not.toBe(0);
      if (!BLANK.has(cp)) {
        const commands = (glyph.path as unknown as { commands: unknown[] }).commands;
        expect(commands.length, `${label} has an outline`).toBeGreaterThan(0);
      }
    }
  });

  it.each(ids)('subset fonts are smaller than sources (%s)', (id) => {
    const source = resolve(fontsDir, 'source', FONT_FILES[id]);
    expect(existsSync(source), `${source} exists`).toBe(true);
    const subset = readFileSync(resolve(fontsDir, FONT_FILES[id])).length;
    expect(subset).toBeLessThan(readFileSync(source).length / 3);
  });

  it.each(ids)('subset keeps TrueType outlines and the original metrics (%s)', (id) => {
    const subset = fontkit.create(new Uint8Array(readFileSync(resolve(fontsDir, FONT_FILES[id]))));
    const source = fontkit.create(
      new Uint8Array(readFileSync(resolve(fontsDir, 'source', FONT_FILES[id]))),
    );
    expect(subset.unitsPerEm).toBe(source.unitsPerEm);
    for (const ch of 'AgC#m7') {
      const cp = ch.codePointAt(0)!;
      expect(subset.glyphForCodePoint(cp).advanceWidth).toBe(
        source.glyphForCodePoint(cp).advanceWidth,
      );
    }
  });

  it('renames the Liberation subsets (OFL reserved font name) and keeps the other names', () => {
    const names = Object.fromEntries(
      ids.map((id) => {
        const font = fontkit.create(
          new Uint8Array(readFileSync(resolve(fontsDir, FONT_FILES[id]))),
        );
        return [id, [font.familyName, font.postscriptName]];
      }),
    );
    expect(names['mono-bold']).toEqual(['Cifras Mono', 'CifrasMono-Bold']);
    expect(names['mono-regular']).toEqual(['Cifras Mono', 'CifrasMono-Regular']);
    expect(names['sans-bold']).toEqual(['Cifras Sans', 'CifrasSans-Bold']);
    expect(names['sans-regular']).toEqual(['Cifras Sans', 'CifrasSans-Regular']);
    for (const id of ids) {
      if (id.startsWith('mono') || id.startsWith('sans')) {
        expect(JSON.stringify(names[id])).not.toMatch(/liberation/i);
      }
    }
  });
});

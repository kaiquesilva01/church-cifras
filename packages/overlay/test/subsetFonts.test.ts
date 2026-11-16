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

  it.each(ids)('keeps copyright and license name records from the source (%s)', (id) => {
    const subset = nameRecords(readFileSync(resolve(fontsDir, FONT_FILES[id])));
    const source = nameRecords(readFileSync(resolve(fontsDir, 'source', FONT_FILES[id])));
    const present = [0, 13, 14].filter((n) => source.has(n));
    expect(present).toContain(0);
    expect(present).toContain(13);
    for (const n of present) expect(subset.get(n), `name ID ${n}`).toBe(source.get(n));
  });
});

// Windows-platform name records by ID, decoded from UTF-16BE.
function nameRecords(font: Buffer): Map<number, string> {
  const tables = font.readUInt16BE(4);
  for (let i = 0; i < tables; i++) {
    const at = 12 + i * 16;
    if (font.toString('latin1', at, at + 4) !== 'name') continue;
    const table = font.subarray(font.readUInt32BE(at + 8));
    const count = table.readUInt16BE(2);
    const strings = table.readUInt16BE(4);
    const out = new Map<number, string>();
    for (let r = 0; r < count; r++) {
      const rec = 6 + r * 12;
      if (table.readUInt16BE(rec) !== 3) continue;
      const length = table.readUInt16BE(rec + 8);
      const offset = strings + table.readUInt16BE(rec + 10);
      out.set(
        table.readUInt16BE(rec + 6),
        Buffer.from(table.subarray(offset, offset + length))
          .swap16()
          .toString('utf16le'),
      );
    }
    return out;
  }
  throw new Error('no name table');
}

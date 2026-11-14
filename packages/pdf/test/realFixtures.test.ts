import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTransposePlan, findKeyIndicator, parseChord, parseKey } from '@cifras/chords';
import type { Measure } from '@cifras/chords';
import { describe, expect, it } from 'vitest';
import { readTextLines } from '../src/readTextLines';

const dir = resolve(import.meta.dirname, '../../../fixtures/private');
const files = existsSync(dir)
  ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.pdf'))
  : [];

const measure: Measure = (text, _font, size) => text.length * 0.6 * size;

const expected: Array<{ prefix: string; key: string | null; kind?: 'title' | 'tom' }> = [
  { prefix: 'Sonda-me', key: 'Bb', kind: 'title' },
  { prefix: 'DEUS DOS DEUSES', key: 'B', kind: 'tom' },
  { prefix: 'Gabriela Rocha - Agnus Dei', key: 'F' },
  { prefix: 'O Medo Não Vai Me Parar', key: 'C' },
  { prefix: 'Renova-me - G', key: 'G' },
  { prefix: 'MEU PRAZER E-3', key: 'E' },
  { prefix: 'Espírito', key: null },
  { prefix: 'João 20', key: null },
];

const QUALITY_WORDS = /maj|min|dim|aug|sus|add|m|b/g;

describe.skipIf(files.length === 0)('real fixtures', () => {
  it.each(files)('%s', async (file) => {
    const lines = await readTextLines(new Uint8Array(readFileSync(resolve(dir, file))));
    const name = file.normalize('NFC');
    const rule = expected.find((e) => name.startsWith(e.prefix.normalize('NFC')));
    expect(rule, `no expectation for ${file}`).toBeDefined();

    const indicator = findKeyIndicator(lines);
    expect(indicator?.key.name ?? null).toBe(rule!.key);
    if (rule!.kind) expect(indicator?.kind).toBe(rule!.kind);

    const from = indicator?.key ?? parseKey('C')!;
    const plan = buildTransposePlan({
      lines,
      from,
      to: parseKey(from.minor ? 'Dm' : 'D')!,
      measure,
    });
    expect(plan.chordCount).toBeGreaterThan(0);
    if (name.startsWith('Gabriela Rocha')) expect(plan.collisions).toBe(0);
    if (name.startsWith('Sonda-me')) {
      for (const c of plan.chords.filter((x) => x.collides)) {
        expect(c.newWidth).toBeGreaterThan(c.width);
      }
    }
    for (const chord of plan.chords) {
      expect(parseChord(chord.original), chord.original).not.toBeNull();
      const row = lines.find((l) => l.page === chord.page && Math.abs(l.y - chord.y) <= 1);
      const boldText = (row?.runs ?? [])
        .filter((r) => r.bold)
        .map((r) => r.text)
        .join(' ')
        .replace(/\S+:|\(?\d+x\)?|x\d+/g, '')
        .replace(QUALITY_WORDS, '');
      expect(boldText, `chord line of ${chord.original}`).not.toMatch(/[a-z]/);
    }
  });
});

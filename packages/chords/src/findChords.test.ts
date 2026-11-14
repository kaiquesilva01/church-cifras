import { describe, expect, it } from 'vitest';
import { findChords } from './findChords';
import { parseKey } from './keys';
import { buildTransposePlan } from './plan';
import { line, measure, run } from './__tests__/helpers';

describe('findChords', () => {
  it('lists every chord occurrence with page and baseline', () => {
    const lines = [
      line([run('Intro: Am G/B', 28)], 1, 700),
      line([run('Senhor meu', 28, false)], 1, 680),
      line([run('[Em] D', 28)], 2, 600),
    ];
    const found = findChords(lines);
    expect(found.map((o) => [o.token.text, o.page, o.y])).toEqual([
      ['Am', 1, 700],
      ['G/B', 1, 700],
      ['[Em]', 2, 600],
      ['D', 2, 600],
    ]);
    expect(found[0]!.chord.rootPc).toBe(9);
    expect(found[2]).toMatchObject({ prefix: '[', suffix: ']' });
  });

  it('excludes the key indicator token and non-chord segments', () => {
    const lines = [
      line([run('Tom: E', 10)], 1, 760),
      line([run('MEU PRAZER DE VIVER', 10)], 1, 740),
      line([run('A E7/9x D', 10)], 1, 720),
      line([run('E A', 10)], 1, 700),
    ];
    expect(findChords(lines).map((o) => o.token.text)).toEqual(['E', 'A']);
    expect(findChords(lines)[0]!.y).toBe(700);
  });

  it('is what the plan counts', () => {
    const lines = [line([run('Tom: E', 10)], 1, 760), line([run('E A [B]', 10)], 1, 700)];
    const plan = buildTransposePlan({ lines, from: parseKey('E')!, to: parseKey('F#')!, measure });
    expect(plan.chordCount).toBe(findChords(lines).length);
    expect(plan.chords).toHaveLength(3);
  });

  it('exposes the following token of the segment', () => {
    const [first, second] = findChords([line([run('Am - G', 10)])]);
    expect(first!.next?.text).toBe('-');
    expect(second!.next).toBeNull();
  });
});

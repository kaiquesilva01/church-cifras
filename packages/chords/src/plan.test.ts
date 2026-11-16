import { describe, expect, it } from 'vitest';
import { parseKey } from './keys';
import { buildTransposePlan } from './plan';
import { line, measure, run } from './__tests__/helpers';

const key = (n: string) => parseKey(n)!;

describe('buildTransposePlan', () => {
  it('plans replacements at original positions', () => {
    const lines = [line([run('A# F/A Gm', 28)]), line([run('Senhor meu', 28, false)], 1, 680)];
    const plan = buildTransposePlan({ lines, from: key('Bb'), to: key('D'), measure });
    expect(plan.chordCount).toBe(3);
    expect(plan.chords.map((c) => c.replacement)).toEqual(['D', 'A/C#', 'Bm']);
    expect(plan.chords[0]).toMatchObject({
      x: 28,
      y: 700,
      page: 1,
      original: 'A#',
      collides: false,
    });
    expect(plan.chords[1]!.x).toBeCloseTo(28 + 3 * 6);
    // F/A -> A/C# grows from 3 to 4 chars with the neighbor 4 chars away
    expect(plan.chords.map((c) => c.collides)).toEqual([false, true, false]);
  });

  it('tight spacing collides', () => {
    const plan = buildTransposePlan({
      lines: [line([run('E7', 10), run('A', 10 + 3 * 6)])],
      from: key('E'),
      to: key('F#'),
      measure,
    });
    // E7 -> F#7 (3 chars) = 18 + 6 > 18
    expect(plan.chords[0]).toMatchObject({ replacement: 'F#7', collides: true });
    expect(plan.chords[1]!.collides).toBe(false);
    expect(plan.collisions).toBe(1);
  });

  it('does not collide when an equal-length chord fits a one-space gap', () => {
    const noisy = (text: string) => text.length * 6.0000001;
    const plan = buildTransposePlan({
      lines: [line([run('F', 10), run('G', 22)])],
      from: key('F'),
      to: key('A'),
      measure: noisy,
    });
    expect(plan.chords[0]).toMatchObject({ replacement: 'A', collides: false });
  });

  it('does not flag collision when there is room', () => {
    const plan = buildTransposePlan({
      lines: [line([run('E', 10), run('A', 10 + 6 * 6)])],
      from: key('E'),
      to: key('F#'),
      measure,
    });
    expect(plan.chords[0]).toMatchObject({ replacement: 'F#', collides: false, newWidth: 12 });
    expect(plan.collisions).toBe(0);
  });

  it('replaces key indicator', () => {
    const title = buildTransposePlan({
      lines: [line([run('PRA SEMPRE (Bb)', 10)]), line([run('A#', 10)], 1, 600)],
      from: key('Bb'),
      to: key('D'),
      measure,
    });
    expect(title.keyIndicator).toMatchObject({ original: '(Bb)', replacement: '(D)', page: 1 });
    expect(title.chordCount).toBe(1);

    const tom = buildTransposePlan({
      lines: [line([run('Tom:', 10), run('E', 40, false)])],
      from: key('E'),
      to: key('F#'),
      measure,
    });
    expect(tom.keyIndicator).toMatchObject({ original: 'E', replacement: 'F#', x: 40 });
    expect(tom.chords).toEqual([]);
    expect(tom.chordCount).toBe(0);
  });

  it('flags a key indicator that would run into the next token', () => {
    const tight = buildTransposePlan({
      lines: [line([run('Tom:', 10, false), run('E', 40, false), run('Cifra', 52, false)])],
      from: key('E'),
      to: key('F#'),
      measure,
    });
    expect(tight.keyIndicator).toMatchObject({ replacement: 'F#', collides: true });
    const roomy = buildTransposePlan({
      lines: [line([run('Tom:', 10, false), run('E', 40, false), run('Cifra', 100, false)])],
      from: key('E'),
      to: key('F#'),
      measure,
    });
    expect(roomy.keyIndicator!.collides).toBe(false);
    const title = buildTransposePlan({
      lines: [line([run('PRA SEMPRE (E)', 10), run('x', 10 + 14 * 6 + 6, false)])],
      from: key('E'),
      to: key('F#'),
      measure,
    });
    expect(title.keyIndicator).toMatchObject({ replacement: '(F#)', collides: true });
  });

  it('does not repaint a bold Tom value as a chord', () => {
    const plan = buildTransposePlan({
      lines: [line([run('Tom: E', 10)])],
      from: key('E'),
      to: key('F#'),
      measure,
    });
    expect(plan.keyIndicator).toMatchObject({ original: 'E', replacement: 'F#' });
    expect(plan.chords).toEqual([]);
  });

  it('same key yields no replacements', () => {
    const plan = buildTransposePlan({
      lines: [line([run('PRA (Bb)', 10)]), line([run('A# F', 10)], 1, 600)],
      from: key('Bb'),
      to: key('Bb'),
      measure,
    });
    expect(plan.chords).toEqual([]);
    expect(plan.keyIndicator).toBeNull();
    expect(plan.chordCount).toBe(2);
    expect(plan.collisions).toBe(0);
  });

  it.each([true, false])('does not collide on the real sample layout (bold spaces: %s)', (bold) => {
    const sp = (x: number, n: number) => run(' '.repeat(n), x, bold);
    const lines = [
      line([
        run('A#', 28.3),
        sp(40.3, 12),
        run('F/A', 112.3),
        sp(130.3, 4),
        run('Gm', 154.3),
        sp(166.3, 6),
        run('Gm7/F', 202.3),
      ]),
    ];
    const plan = buildTransposePlan({ lines, from: key('Bb'), to: key('D'), measure });
    expect(plan.chords.map((c) => c.replacement)).toEqual(['D', 'A/C#', 'Bm', 'Bm7/A']);
    expect(plan.chords.map((c) => c.collides)).toEqual([false, false, false, false]);
  });

  it('flags the last token when it overflows the right margin', () => {
    const plan = buildTransposePlan({
      lines: [line([run('E', 575)])],
      from: key('E'),
      to: key('F#'),
      measure,
    });
    expect(plan.chords[0]).toMatchObject({ replacement: 'F#', collides: true });
    const ok = buildTransposePlan({
      lines: [line([run('E', 500)])],
      from: key('E'),
      to: key('F#'),
      measure,
    });
    expect(ok.chords[0]!.collides).toBe(false);
  });

  it('carries the overlay data of the original run', () => {
    const tall = { ...run('Am', 28), ascent: 0.9, descent: -0.3 };
    const plain = { ...run('G', 80, false), ascent: 0.7, descent: -0.25 };
    const plan = buildTransposePlan({
      lines: [line([tall, plain])],
      from: key('Am'),
      to: key('Cm'),
      measure,
    });
    expect(plan.chords[0]).toMatchObject({ ascent: 0.9, descent: -0.3, bold: true });
    const tom = buildTransposePlan({
      lines: [line([run('Tom:', 10), { ...run('Am', 40, false), ascent: 0.7 }])],
      from: key('Am'),
      to: key('Cm'),
      measure,
    });
    expect(tom.keyIndicator).toMatchObject({ ascent: 0.7, descent: -0.2, bold: false });
  });

  it('places tokens of a proportional run by measured prefix, not by character index', () => {
    const wide = (text: string) =>
      [...text].reduce((w, c) => w + (c === 'm' ? 20 : c === ' ' ? 3 : 6), 0);
    const text = 'Am Cm D';
    const proportional = { ...run(text, 10), width: wide(text) };
    const plan = buildTransposePlan({
      lines: [line([proportional])],
      from: key('Am'),
      to: key('Cm'),
      measure: wide,
    });
    expect(plan.chords.map((c) => c.x)).toEqual([10, 10 + wide('Am '), 10 + wide('Am Cm ')]);
    expect(plan.chords[0]!.width).toBeCloseTo(wide('Am'));
    // true widths: Am=26, Cm=26, D=6; Cm -> Ebm
    expect(plan.chords.map((c) => c.newWidth)).toEqual([wide('Cm'), wide('Ebm'), wide('F')]);
  });

  it('transposes [Am] and keeps the brackets', () => {
    const plan = buildTransposePlan({
      lines: [line([run('[Am] Am', 10)])],
      from: key('Am'),
      to: key('Cm'),
      measure,
    });
    expect(plan.chordCount).toBe(2);
    expect(plan.chords.map((c) => [c.original, c.replacement])).toEqual([
      ['[Am]', '[Cm]'],
      ['Am', 'Cm'],
    ]);
  });

  it('transposes a bracketed intro line but leaves a [Refrão] label alone', () => {
    const plan = buildTransposePlan({
      lines: [line([run('[Intro: Am G]', 10)]), line([run('[Refrão]', 10)], 1, 600)],
      from: key('Am'),
      to: key('Cm'),
      measure,
    });
    expect(plan.chords.map((c) => [c.original, c.replacement])).toEqual([
      ['Am', 'Cm'],
      ['G]', 'Bb]'],
    ]);
    expect(plan.suspectSegments).toEqual([]);
  });

  it('transposes slash-digit chords', () => {
    const plan = buildTransposePlan({
      lines: [line([run('E7/9 G6/9', 10)])],
      from: key('E'),
      to: key('F#'),
      measure,
    });
    expect(plan.chords.map((c) => c.replacement)).toEqual(['F#7/9', 'A6/9']);
  });

  it('reports bold segments with a chord and an unknown token as suspects', () => {
    const plan = buildTransposePlan({
      lines: [line([run('A E7/9x D', 10)], 2, 650)],
      from: key('A'),
      to: key('B'),
      measure,
    });
    expect(plan.chordCount).toBe(0);
    expect(plan.suspectSegments).toEqual([{ page: 2, y: 650, unknown: ['E7/9x'], chords: 2 }]);
  });

  it('does not flag uppercase titles with E/A as suspect (does not flag A CASA DE DEUS)', () => {
    for (const text of [
      'MEU PRAZER E',
      'SANTO E DIGNO',
      'A DEUS',
      'DEUS E BOM',
      'Refrão A',
      'Final: A E (2x) Fim',
      'A CASA DE DEUS',
      'A GRANDE ALEGRIA DO SENHOR',
      'E EM ADORAÇÃO DA IGREJA',
    ]) {
      const plan = buildTransposePlan({
        lines: [line([run(text, 10)])],
        from: key('A'),
        to: key('B'),
        measure,
      });
      expect(plan.suspectSegments, text).toEqual([]);
    }
  });

  it('counts chord attempts as unknown tokens', () => {
    for (const bad of ['A*', 'Bbx', 'E7/9x']) {
      const plan = buildTransposePlan({
        lines: [line([run(`D ${bad}`, 10)])],
        from: key('A'),
        to: key('B'),
        measure,
      });
      expect(plan.suspectSegments[0]?.unknown, bad).toEqual([bad]);
    }
  });

  it('does not flag long bold titles or pure chord lines as suspects', () => {
    const plan = buildTransposePlan({
      lines: [
        line([run('A GRANDE ALEGRIA NOSSA SENHOR', 10)]),
        line([run('Am G', 10)], 1, 600),
        line([run('Intro: 2x', 10)], 1, 500),
      ],
      from: key('A'),
      to: key('B'),
      measure,
    });
    expect(plan.suspectSegments).toEqual([]);
  });

  it('counts chord lines skipped because of non chord-like words', () => {
    const plan = buildTransposePlan({
      lines: [
        line([run('Am G (repete', 10)], 1, 700),
        line([run('D Em volta ao início', 10)], 1, 650),
        line([run('Am G', 10)], 1, 600),
      ],
      from: key('A'),
      to: key('B'),
      measure,
    });
    expect(plan.ignoredChordLines).toBe(1);
    expect(plan.suspectSegments).toEqual([]);
  });

  it('does not count titles without chords', () => {
    const plan = buildTransposePlan({
      lines: [
        line([run('Louvor ao Senhor', 10)], 1, 700),
        line([run('MEU PRAZER E', 10)], 1, 650),
        line([run('A GRANDE ALEGRIA NOSSA SENHOR', 10)], 1, 600),
        line([run('Am G', 10)], 1, 550),
        line([run('A E7/9x D', 10)], 1, 500),
      ],
      from: key('A'),
      to: key('B'),
      measure,
    });
    expect(plan.ignoredChordLines).toBe(0);
    expect(plan.suspectSegments).toHaveLength(1);
  });

  it('counts annotated chord lines as ignored', () => {
    const count = (text: string) =>
      buildTransposePlan({
        lines: [line([run(text, 10)])],
        from: key('A'),
        to: key('B'),
        measure,
      }).ignoredChordLines;
    expect(count('A E (volta ao início)')).toBe(1);
    expect(count('A D (BIS)')).toBe(1);
    expect(count('Deus é Fiel A')).toBe(0);
    expect(count('MEU PRAZER E')).toBe(0);
  });

  describe('run identity and limits', () => {
    it('exposes the same runKey for chords of one run and different keys for other runs', () => {
      const lines = [
        line([run('A# F/A Gm', 28)]),
        line([run('Dm', 28, true, 680), run('Gm', 200, true, 680)], 1, 680),
        line([run('Am', 28)], 2, 700),
      ];
      const plan = buildTransposePlan({ lines, from: key('Bb'), to: key('D'), measure });
      const keys = plan.chords.map((c) => c.runKey);
      expect(keys[0]).toBe(keys[1]);
      expect(keys[1]).toBe(keys[2]);
      expect(new Set(keys).size).toBe(4);
      expect(keys.every((k) => typeof k === 'string' && k.length > 0)).toBe(true);
    });

    it('exposes the space width and the collision limit', () => {
      const plan = buildTransposePlan({
        lines: [line([run('E7 A', 10)])],
        from: key('E'),
        to: key('F#'),
        measure,
      });
      const [first, last] = plan.chords;
      expect(first!.spaceWidth).toBeCloseTo(6);
      // next token starts at 10 + 18; limit = next.x - width('n') + tolerance (0.05 em)
      expect(first!.limitX).toBeCloseTo(28 - 6 + 0.5);
      // last token: page edge (600 - 20) + tolerance
      expect(last!.limitX).toBeCloseTo(580.5);
      expect(first!.collides).toBe(first!.x + first!.newWidth > first!.limitX);
    });

    it('also carries them on the key indicator', () => {
      const plan = buildTransposePlan({
        lines: [line([run('Tom: E', 10, false)]), line([run('E', 10, true, 680)], 1, 680)],
        from: key('E'),
        to: key('F#'),
        measure,
      });
      expect(plan.keyIndicator).toMatchObject({ spaceWidth: 6 });
      expect(typeof plan.keyIndicator!.runKey).toBe('string');
      expect(plan.keyIndicator!.runKey).not.toBe(plan.chords[0]!.runKey);
    });
  });
});

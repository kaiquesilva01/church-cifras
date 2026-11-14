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

  it('treats [Am] as a label and does not transpose it', () => {
    const plan = buildTransposePlan({
      lines: [line([run('[Am] Am', 10)])],
      from: key('Am'),
      to: key('Cm'),
      measure,
    });
    expect(plan.chordCount).toBe(1);
    expect(plan.chords.map((c) => c.original)).toEqual(['Am']);
  });
});

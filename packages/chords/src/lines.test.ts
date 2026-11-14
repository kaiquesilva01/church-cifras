import { describe, expect, it } from 'vitest';
import {
  analyzeSegment,
  classifySegment,
  isLabel,
  mergeFragments,
  parseChordToken,
  segmentLine,
  tokenizeSegment,
} from './lines';
import { line, run } from './__tests__/helpers';

describe('lines', () => {
  it('merges adjacent bold fragments', () => {
    const merged = mergeFragments([run('B', 10), run('m', 16), run('7', 22), run('A', 100)]);
    expect(merged.map((r) => r.text)).toEqual(['Bm7', 'A']);
    expect(merged[0]!.x).toBe(10);
    expect(merged[0]!.width).toBeCloseTo(18);
  });

  it('splits a line into segments at large gaps', () => {
    const segs = segmentLine(line([run('A', 10), run('B', 60), run('C', 400)]));
    expect(segs.map((s) => s.map((r) => r.text))).toEqual([['A', 'B'], ['C']]);
  });

  it('tokenizes multi-chord run with positions', () => {
    const tokens = tokenizeSegment([run('Intro: A# F/A', 28)]);
    expect(tokens.map((t) => t.text)).toEqual(['Intro:', 'A#', 'F/A']);
    expect(tokens[1]!.x).toBeCloseTo(28 + 7 * 6);
    expect(tokens[1]!.width).toBeCloseTo(12);
  });

  it('ignores non-bold runs when tokenizing', () => {
    expect(tokenizeSegment([run('Senhor', 10, false), run('Am', 80)]).map((t) => t.text)).toEqual([
      'Am',
    ]);
  });

  it('recognizes labels', () => {
    for (const l of ['Intro:', '[Refrão]', '2x', 'x2', '(2x)', '(', ')', '-', '–', '|', '/'])
      expect(isLabel(l)).toBe(true);
    expect(isLabel('Am')).toBe(false);
  });

  it('classifies chord lines with labels', () => {
    const seg = [run('Intro: A# F/A [Refrão] 2x (2x) |', 10)];
    expect(classifySegment(tokenizeSegment(seg))).toBe('chords');
  });

  it('ignores bold title even when it contains chord-like words', () => {
    expect(classifySegment(tokenizeSegment([run('MEU PRAZER E', 10)]))).toBe('other');
  });

  it('treats label-only segments as other', () => {
    expect(classifySegment(tokenizeSegment([run('Intro: 2x', 10)]))).toBe('other');
  });

  it('parses chords wrapped in brackets and keeps the punctuation', () => {
    expect(parseChordToken('[Am]')).toMatchObject({ prefix: '[', suffix: ']' });
    expect(parseChordToken('[Am')).toMatchObject({ prefix: '[', suffix: '' });
    expect(parseChordToken('G]')).toMatchObject({ prefix: '', suffix: ']' });
    expect(parseChordToken('[Intro:Am]')).toMatchObject({ prefix: '[Intro:', suffix: ']' });
    expect(parseChordToken('Am')).toMatchObject({ prefix: '', suffix: '' });
    expect(parseChordToken('[Refr�o]')).toBeNull();
    expect(parseChordToken('[Intro:')).toBeNull();
  });

  it('classifies a bracketed intro line as chords', () => {
    expect(classifySegment(tokenizeSegment([run('[Intro: Am G]', 10)]))).toBe('chords');
    expect(classifySegment(tokenizeSegment([run('[Refr�o] 2x', 10)]))).toBe('other');
  });

  it('reports unknown tokens next to chords', () => {
    const a = analyzeSegment(tokenizeSegment([run('A E7/9x D', 10)]));
    expect(a.chords.map((c) => c.token.text)).toEqual(['A', 'D']);
    expect(a.unknown).toEqual(['E7/9x']);
  });
});

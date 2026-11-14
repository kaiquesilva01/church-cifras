import { parseKey, type Key } from './keys';
import { classifySegment, segmentLine, spanInRun, tokenizeSegment } from './lines';
import type { Measure, TextLine, TextRun, Token } from './lines';

export interface KeyIndicator {
  page: number;
  y: number;
  kind: 'title' | 'tom';
  token: Token;
  key: Key;
}

const TITLE_KEY = /\(([A-G][#b]?m?)\)\s*$/;

interface Glyph {
  ch: string;
  x: number;
  width: number;
  run: TextRun;
}

// Reads the segment as one string so `Tom:E`, `Tom E` and `Tom` + `:` in separate runs all match.
function findTomKey(segment: TextRun[], measure?: Measure): { token: Token; key: Key } | null {
  const glyphs: Glyph[] = [];
  const sorted = [...segment].sort((a, b) => a.x - b.x);
  let prev: TextRun | undefined;
  for (const run of sorted) {
    if (prev && run.x - (prev.x + prev.width) > 0.1 * run.fontSize) {
      const last = glyphs[glyphs.length - 1];
      if (last && !/\s/.test(last.ch) && !/^\s/.test(run.text)) {
        glyphs.push({ ch: ' ', x: prev.x + prev.width, width: 0, run: prev });
      }
    }
    for (let i = 0; i < run.text.length; i++) {
      glyphs.push({ ch: run.text[i]!, ...spanInRun(run, i, i + 1, measure), run });
    }
    prev = run;
  }
  const text = glyphs.map((g) => g.ch).join('');
  for (const match of text.matchAll(/(?:^|\s)tom(?:\s*:\s*|\s+)([A-G][#b]?m?)(?=\s|$)/gi)) {
    const key = parseKey(match[1]!);
    if (!key) continue;
    const start = match.index + match[0].length - match[1]!.length;
    const first = glyphs[start]!;
    const last = glyphs[start + match[1]!.length - 1]!;
    const token: Token = {
      text: match[1]!,
      x: first.x,
      width: last.x + last.width - first.x,
      run: first.run,
    };
    return { token, key };
  }
  return null;
}

export function findKeyIndicator(lines: TextLine[], measure?: Measure): KeyIndicator | null {
  for (const line of lines) {
    for (const segment of segmentLine(line)) {
      const tom = findTomKey(segment, measure);
      if (tom) return { page: line.page, y: line.y, kind: 'tom', token: tom.token, key: tom.key };
      if (classifySegment(tokenizeSegment(segment)) === 'chords') continue;
      for (const run of segment) {
        const match = TITLE_KEY.exec(run.text);
        const key = match ? parseKey(match[1]!) : null;
        if (!match || !key) continue;
        const { x, width } = spanInRun(
          run,
          match.index,
          match.index + match[1]!.length + 2,
          measure,
        );
        const token: Token = { text: `(${match[1]})`, x, width, run };
        return { page: line.page, y: line.y, kind: 'title', token, key };
      }
    }
  }
  return null;
}

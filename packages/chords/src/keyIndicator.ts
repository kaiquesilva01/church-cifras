import { parseKey, type Key } from './keys';
import { classifySegment, segmentLine, spanInRun, tokenizeRuns, tokenizeSegment } from './lines';
import type { Measure, TextLine, Token } from './lines';

export interface KeyIndicator {
  page: number;
  y: number;
  kind: 'title' | 'tom';
  token: Token;
  key: Key;
}

const TITLE_KEY = /\(([A-G][#b]?m?)\)\s*$/;

export function findKeyIndicator(lines: TextLine[], measure?: Measure): KeyIndicator | null {
  for (const line of lines) {
    for (const segment of segmentLine(line)) {
      const tokens = tokenizeRuns(segment, measure);
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]!;
        if (!/^tom:?$/i.test(token.text)) continue;
        const next = tokens[i + 1];
        const key = next ? parseKey(next.text) : null;
        if (next && key) return { page: line.page, y: line.y, kind: 'tom', token: next, key };
      }
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

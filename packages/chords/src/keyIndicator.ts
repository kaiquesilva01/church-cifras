import { parseKey, type Key } from './keys';
import { classifySegment, segmentLine, tokenizeRuns, tokenizeSegment } from './lines';
import type { TextLine, Token } from './lines';

export interface KeyIndicator {
  page: number;
  y: number;
  kind: 'title' | 'tom';
  token: Token;
  key: Key;
}

const TITLE_KEY = /\(([A-G][#b]?m?)\)\s*$/;

export function findKeyIndicator(lines: TextLine[]): KeyIndicator | null {
  for (const line of lines) {
    for (const segment of segmentLine(line)) {
      const tokens = tokenizeRuns(segment);
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
        if (!match || !key || match.index === 0) continue;
        const perChar = run.width / run.text.length;
        const token: Token = {
          text: `(${match[1]})`,
          x: run.x + perChar * match.index,
          width: perChar * (match[1]!.length + 2),
          run,
        };
        return { page: line.page, y: line.y, kind: 'title', token, key };
      }
    }
  }
  return null;
}

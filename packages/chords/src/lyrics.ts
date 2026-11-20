import { findKeyIndicator } from './keyIndicator';
import type { KeyIndicator } from './keyIndicator';
import { analyzeSegment, segmentLine, tokenizeSegment } from './lines';
import type { Measure, TextLine, TextRun } from './lines';

export interface LyricsOptions {
  indicator?: KeyIndicator | null;
  measure?: Measure;
}

// Runs are joined without a space when they touch (a word split across runs), and with one when
// there is a visible gap between them.
function segmentText(runs: TextRun[]): string {
  const sorted = [...runs].sort((a, b) => a.x - b.x);
  let text = '';
  let prev: TextRun | undefined;
  for (const run of sorted) {
    if (prev) {
      const gap = run.x - (prev.x + prev.width);
      text += gap <= 0.15 * prev.fontSize ? '' : ' ';
    }
    text += run.text;
    prev = run;
  }
  return text.replace(/\s+/g, ' ').trim();
}

// Lyric text of already-parsed lines: chord lines and the key-indicator line are left out.
export function extractLyrics(lines: TextLine[], options: LyricsOptions = {}): string {
  const { measure } = options;
  const indicator =
    options.indicator === undefined ? findKeyIndicator(lines, measure) : options.indicator;
  const out: string[] = [];
  for (const line of lines) {
    if (indicator !== null && indicator.page === line.page && indicator.y === line.y) continue;
    for (const segment of segmentLine(line)) {
      const { chords, unknown } = analyzeSegment(tokenizeSegment(segment, measure));
      if (unknown.length === 0 && chords.length > 0) continue;
      const text = segmentText(segment);
      if (text) out.push(text);
    }
  }
  return out.join('\n');
}

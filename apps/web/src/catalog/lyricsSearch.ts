import { normalizeText } from '@cifras/chords';
import { MIN_LYRICS_QUERY } from './lyricsLimits';
import { compareTitles } from './search';
import type { SongSummary } from './types';

/** Tamanho aproximado do trecho (sem contar os "…"). */
const SNIPPET_CHARS = 120;

export interface SnippetPart {
  text: string;
  match: boolean;
}

export interface LyricHit {
  song: SongSummary;
  /** Partes do trecho; juntas com um espaço formam o trecho. */
  snippet: SnippetPart[];
  /** As palavras da busca aparecem seguidas, na mesma ordem, na letra. */
  phrase: boolean;
}

interface Token {
  /** Palavra como está na letra (mantém acentos e pontuação). */
  text: string;
  /** Palavra normalizada; vazia quando a palavra é só pontuação ("—"). */
  norm: string;
}

interface Location {
  start: number;
  end: number;
  phrase: boolean;
}

/** Casa como `matchesAll`: todas as palavras da busca precisam aparecer no texto. */
export function searchLyrics(
  songs: SongSummary[],
  lyrics: ReadonlyMap<string, string>,
  query: string,
  exclude: ReadonlySet<string> = new Set<string>(),
): LyricHit[] {
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery.length < MIN_LYRICS_QUERY) return [];
  const words = normalizedQuery.split(' ');

  const hits: LyricHit[] = [];
  for (const song of songs) {
    if (exclude.has(song.id)) continue;
    const text = lyrics.get(song.id);
    if (text === undefined) continue;
    const normalized = normalizeText(text);
    if (!words.every((w) => normalized.includes(w))) continue;

    const tokens = tokenize(text);
    const location = locate(tokens, words);
    hits.push({
      song,
      snippet: buildSnippet(tokens, words, location),
      phrase: location.phrase,
    });
  }

  return hits.sort(
    (a, b) =>
      Number(b.phrase) - Number(a.phrase) ||
      compareTitles(a.song.titleNormalized, b.song.titleNormalized),
  );
}

function tokenize(text: string): Token[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({ text: word, norm: normalizeText(word) }));
}

/** Primeira sequência de palavras consecutivas (ignorando pontuação solta); senão a primeira palavra que casa. */
function locate(tokens: Token[], words: string[]): Location {
  const content = tokens.flatMap((t, index) => (t.norm === '' ? [] : [{ index, norm: t.norm }]));
  for (let p = 0; p + words.length <= content.length; p++) {
    const first = content[p];
    const last = content[p + words.length - 1];
    if (first && last && words.every((w, k) => content[p + k]?.norm.includes(w))) {
      return { start: first.index, end: last.index, phrase: true };
    }
  }
  const first = tokens.findIndex((t) => words.some((w) => t.norm.includes(w)));
  return { start: first, end: first, phrase: false };
}

function buildSnippet(tokens: Token[], words: string[], location: Location): SnippetPart[] {
  let lo = location.start;
  let hi = location.end;
  let length = tokens.slice(lo, hi + 1).reduce((sum, t) => sum + t.text.length, 0) + (hi - lo);

  // Expande palavra a palavra, alternando esquerda e direita, até não caber mais.
  let growLeft = true;
  let growRight = true;
  while (growLeft || growRight) {
    const left = growLeft ? tokens[lo - 1] : undefined;
    if (left && length + 1 + left.text.length <= SNIPPET_CHARS) {
      lo -= 1;
      length += 1 + left.text.length;
    } else {
      growLeft = false;
    }

    const right = growRight ? tokens[hi + 1] : undefined;
    if (right && length + 1 + right.text.length <= SNIPPET_CHARS) {
      hi += 1;
      length += 1 + right.text.length;
    } else {
      growRight = false;
    }
  }

  const isMatch = (i: number, token: Token) =>
    location.phrase
      ? i >= location.start && i <= location.end
      : words.some((w) => token.norm.includes(w));

  const parts: SnippetPart[] = [];
  for (const [offset, token] of tokens.slice(lo, hi + 1).entries()) {
    const match = isMatch(lo + offset, token);
    const last = parts[parts.length - 1];
    if (last && last.match === match) last.text += ` ${token.text}`;
    else parts.push({ text: token.text, match });
  }

  if (lo > 0) parts.unshift({ text: '…', match: false });
  if (hi < tokens.length - 1) parts.push({ text: '…', match: false });
  return parts;
}

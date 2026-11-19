import { normalizeText } from '@cifras/chords';
import type { ArtistSummary, SongSummary } from './types';

const HARPA_SINGER = 'harpa';

/** Músicas do cantor "Harpa" ficam só na seção Harpa, fora de Músicas, Cantores e Busca. */
export function isHarpa(song: SongSummary): boolean {
  return normalizeText(song.artistName.trim()) === HARPA_SINGER;
}

export function splitHarpa(songs: SongSummary[]): {
  regular: SongSummary[];
  harpa: SongSummary[];
} {
  const regular: SongSummary[] = [];
  const harpa: SongSummary[] = [];
  for (const song of songs) (isHarpa(song) ? harpa : regular).push(song);
  return { regular, harpa };
}

/** Ordena títulos já normalizados; números contam como número ("15 -" antes de "134 -"). */
export function compareTitles(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { numeric: true });
}

function matchesAll(haystack: string, query: string): boolean {
  const words = normalizeText(query).split(' ').filter(Boolean);
  return words.every((w) => haystack.includes(w));
}

export function filterSongs(songs: SongSummary[], query: string): SongSummary[] {
  return songs.filter((s) =>
    matchesAll(`${s.titleNormalized} ${normalizeText(s.artistName)}`, query),
  );
}

export function deriveArtists(songs: SongSummary[]): ArtistSummary[] {
  const byId = new Map<string, ArtistSummary>();
  for (const s of songs) {
    const found = byId.get(s.artistId);
    if (found) found.songCount += 1;
    else byId.set(s.artistId, { id: s.artistId, name: s.artistName, songCount: 1 });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function filterArtists(artists: ArtistSummary[], query: string): ArtistSummary[] {
  return artists.filter((a) => matchesAll(normalizeText(a.name), query));
}

import { describe, expect, it } from 'vitest';
import { searchLyrics } from './lyricsSearch';
import type { SongSummary } from './types';

const song = (id: string, title: string): SongSummary => ({
  id,
  title,
  titleNormalized: title.toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''),
  artistId: 'artist',
  artistName: 'Artista',
  keys: [],
  handmadeKeys: [],
});

/** Palavras de enchimento de 5 letras: cada uma soma 6 caracteres ao trecho (espaço + palavra). */
const ipsum = (n: number) => Array<string>(n).fill('ipsum');

describe('searchLyrics', () => {
  it('finds a song when every word is in the lyrics', () => {
    const songs = [song('s1', 'Glória ao Rei')];
    const lyrics = new Map([['s1', 'Glória ao Rei de toda a terra']]);

    expect(searchLyrics(songs, lyrics, 'GLORIA rei').map((h) => h.song.id)).toEqual(['s1']);
    expect(searchLyrics(songs, lyrics, 'gloria deus')).toEqual([]);
  });

  it('returns nothing for queries under 3 normalized characters', () => {
    const songs = [song('s1', 'Alfa')];
    const lyrics = new Map([['s1', 'a é — Deus']]);

    for (const query of ['a', 'é', '—', '  ']) {
      expect(searchLyrics(songs, lyrics, query)).toEqual([]);
    }
  });

  it('ignores songs without a lyrics entry', () => {
    const songs = [song('s1', 'Alfa'), song('s2', 'Beta')];
    const lyrics = new Map([['s2', 'Deus é amor']]);

    expect(searchLyrics(songs, lyrics, 'deus').map((h) => h.song.id)).toEqual(['s2']);
  });

  it('skips excluded song ids', () => {
    const songs = [song('s1', 'Alfa'), song('s2', 'Beta')];
    const lyrics = new Map([['s2', 'Deus é amor']]);

    expect(searchLyrics(songs, lyrics, 'deus', new Set(['s2']))).toEqual([]);
  });

  it('marks phrase=true only when the words appear together in order, phrase hits first then by title', () => {
    const songs = [song('s1', 'Zebra'), song('s2', 'Alfa'), song('s3', 'Mar'), song('s4', 'Beta')];
    const lyrics = new Map([
      ['s1', 'amor de Deus'],
      ['s2', 'Deus e amor'],
      ['s3', 'o Deus amor eterno'],
      ['s4', 'Deus, amor'],
    ]);

    const hits = searchLyrics(songs, lyrics, 'deus amor');

    expect(hits.map((h) => h.song.id)).toEqual(['s4', 's3', 's2', 's1']);
    expect(hits.map((h) => h.phrase)).toEqual([true, true, false, false]);
  });

  it('highlights the matched words with their original accents', () => {
    const songs = [song('s1', 'Glória')];
    const lyrics = new Map([['s1', 'Glória ao Senhor Deus todo poderoso']]);

    const hit = searchLyrics(songs, lyrics, 'Senhor Deus todo poderoso')[0];

    expect(hit?.snippet).toEqual([
      { text: 'Glória ao', match: false },
      { text: 'Senhor Deus todo poderoso', match: true },
    ]);
  });

  it('snippet is about 120 characters, cut on word boundaries, with … only on the cut sides', () => {
    const songs = [song('s1', 'Senhor')];

    // Match no começo: sem "…" à esquerda; o trecho para em 120 caracteres.
    const start = new Map([['s1', ['Senhor', ...ipsum(30)].join(' ')]]);
    expect(searchLyrics(songs, start, 'senhor')[0]?.snippet).toEqual([
      { text: 'Senhor', match: true },
      { text: ipsum(19).join(' '), match: false },
      { text: '…', match: false },
    ]);

    // Match no fim: sem "…" à direita.
    const end = new Map([['s1', [...ipsum(30), 'Senhor'].join(' ')]]);
    expect(searchLyrics(songs, end, 'senhor')[0]?.snippet).toEqual([
      { text: '…', match: false },
      { text: ipsum(19).join(' '), match: false },
      { text: 'Senhor', match: true },
    ]);

    // Match no meio: "…" dos dois lados, com a janela equilibrada.
    const middle = new Map([['s1', [...ipsum(30), 'Senhor', ...ipsum(30)].join(' ')]]);
    expect(searchLyrics(songs, middle, 'senhor')[0]?.snippet).toEqual([
      { text: '…', match: false },
      { text: ipsum(10).join(' '), match: false },
      { text: 'Senhor', match: true },
      { text: ipsum(9).join(' '), match: false },
      { text: '…', match: false },
    ]);
  });

  it('matches inside a word like the title search does', () => {
    const songs = [song('s1', 'Alfa')];
    const lyrics = new Map([['s1', 'Deus todo poderoso']]);

    const hit = searchLyrics(songs, lyrics, 'pod')[0];

    expect(hit?.snippet).toEqual([
      { text: 'Deus todo', match: false },
      { text: 'poderoso', match: true },
    ]);
  });

  it('centers on the first phrase occurrence, else on the first matching word', () => {
    const songs = [song('s1', 'Alfa')];

    // Duas ocorrências da frase: o trecho começa na primeira.
    const twoPhrases = new Map([['s1', ['Deus', 'amor', ...ipsum(30), 'Deus', 'amor'].join(' ')]]);
    expect(searchLyrics(songs, twoPhrases, 'deus amor')[0]?.snippet).toEqual([
      { text: 'Deus amor', match: true },
      { text: ipsum(18).join(' '), match: false },
      { text: '…', match: false },
    ]);

    // Sem frase: o trecho centraliza na primeira palavra encontrada ("Deus"), não em "amor".
    const noPhrase = new Map([
      ['s1', [...ipsum(30), 'Deus', ...ipsum(30), 'amor', ...ipsum(30)].join(' ')],
    ]);
    const hit = searchLyrics(songs, noPhrase, 'deus amor')[0];
    expect(hit?.phrase).toBe(false);
    expect(hit?.snippet).toEqual([
      { text: '…', match: false },
      { text: ipsum(10).join(' '), match: false },
      { text: 'Deus', match: true },
      { text: ipsum(9).join(' '), match: false },
      { text: '…', match: false },
    ]);
  });

  it('turns line breaks into spaces', () => {
    const songs = [song('s1', 'Alfa')];
    const lyrics = new Map([['s1', 'Deus\namor eterno']]);

    const hit = searchLyrics(songs, lyrics, 'deus amor')[0];

    expect(hit?.phrase).toBe(true);
    expect(hit?.snippet).toEqual([
      { text: 'Deus amor', match: true },
      { text: 'eterno', match: false },
    ]);
  });
});

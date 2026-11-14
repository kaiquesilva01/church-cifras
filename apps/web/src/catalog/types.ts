import type { KeyName } from '@cifras/chords';

export interface SongSummary {
  id: string;
  title: string;
  titleNormalized: string;
  artistId: string;
  artistName: string;
  keys: KeyName[];
  handmadeKeys: KeyName[];
}

export interface ArtistSummary {
  id: string;
  name: string;
  songCount: number;
}

export interface NewArrangementInput {
  key: KeyName;
  storagePath: string;
  chordCount: number;
}

export interface NewSongInput extends NewArrangementInput {
  /** Id reservado com `newSongId()`; o arquivo já foi enviado para `songs/{songId}/`. */
  songId: string;
  title: string;
  artistName: string;
}

export type UploadPlan = {
  file: Blob;
  key: KeyName;
  chordCount: number;
} & (
  | { action: 'new-song'; title: string; artistName: string }
  | { action: 'add-key'; songId: string }
  | { action: 'replace-generated'; songId: string }
);

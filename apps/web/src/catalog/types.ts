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

export interface ArrangementSummary {
  key: KeyName;
  source: 'handmade' | 'generated';
  storagePath: string;
  derivedFromKey: KeyName | null;
  collisions: number;
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

export interface NewGeneratedArrangementInput extends NewArrangementInput {
  /** Tom feito à mão de onde o PDF foi gerado. */
  derivedFromKey: KeyName;
  collisions: number;
  createdBy: string;
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

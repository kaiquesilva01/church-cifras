import type { KeyName } from '@cifras/chords';
import { ArrangementExistsError, type CatalogApi } from '../catalog/catalogApi';

export interface SaveGeneratedInput {
  songId: string;
  key: KeyName;
  bytes: Uint8Array;
  derivedFromKey: KeyName;
  chordCount: number;
  collisions: number;
  uid: string;
}

const errorCode = (error: unknown): unknown =>
  typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;

// Upload, then create the arrangement. If someone else saved the key first the rules deny the
// create: our file is discarded and the caller opens the existing key.
export async function saveGenerated(
  api: CatalogApi,
  input: SaveGeneratedInput,
): Promise<{ key: KeyName; status: 'created' | 'existing' }> {
  const { songId, key } = input;
  const file = new Blob([input.bytes as BlobPart], { type: 'application/pdf' });
  const storagePath = await api.uploadPdf(songId, key, file);
  try {
    await api.createGeneratedArrangement(songId, {
      key,
      storagePath,
      derivedFromKey: input.derivedFromKey,
      chordCount: input.chordCount,
      collisions: input.collisions,
      createdBy: input.uid,
    });
    return { key, status: 'created' };
  } catch (error) {
    await api.deleteFile(storagePath).catch(() => undefined);
    if (error instanceof ArrangementExistsError || errorCode(error) === 'permission-denied') {
      const existing = await api.getArrangement(songId, key).catch(() => null);
      if (existing) return { key, status: 'existing' };
    }
    throw error;
  }
}

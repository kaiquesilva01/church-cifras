import { keySlug, parseKey, type KeyName } from '@cifras/chords';
import { HttpsError } from 'firebase-functions/v2/https';

export type ReplaceResult = { previousPath: string } | 'missing' | 'handmade' | 'same-file';

export type ReplaceDeps = {
  // Transacional: lê o tom, confere (existe, é gerado, arquivo diferente) e grava.
  replaceIfGenerated(
    songId: string,
    slug: string,
    data: Record<string, unknown>,
  ): Promise<ReplaceResult>;
  deleteFile(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  // Dono (metadata.uploadedBy) do arquivo; null quando ausente.
  getFileOwner(path: string): Promise<string | null>;
  now(): Date;
};

type ReplaceInput = {
  uid: string;
  songId: unknown;
  key: unknown;
  storagePath: unknown;
  chordCount: unknown;
};

export async function replaceArrangement(
  deps: ReplaceDeps,
  input: ReplaceInput,
): Promise<{ songId: string; key: KeyName }> {
  const { uid, songId, key, storagePath, chordCount } = input;
  if (typeof songId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(songId)) {
    throw new HttpsError('invalid-argument', 'Invalid song.');
  }
  const parsed = typeof key === 'string' ? parseKey(key) : null;
  if (!parsed || parsed.name !== key) {
    throw new HttpsError('invalid-argument', 'Invalid key.');
  }
  if (typeof chordCount !== 'number' || !Number.isInteger(chordCount) || chordCount < 1) {
    throw new HttpsError('invalid-argument', 'Invalid chord count.');
  }
  const slug = keySlug(parsed.name);
  if (
    typeof storagePath !== 'string' ||
    !storagePath.startsWith(`songs/${songId}/${slug}-`) ||
    !storagePath.endsWith('.pdf') ||
    storagePath.slice(`songs/${songId}/`.length).includes('/')
  ) {
    throw new HttpsError('invalid-argument', 'Invalid file path.');
  }

  if (!(await deps.fileExists(storagePath))) {
    throw new HttpsError('invalid-argument', 'Uploaded file not found.');
  }

  if ((await deps.getFileOwner(storagePath)) !== uid) {
    throw new HttpsError('permission-denied', 'File was not uploaded by the caller.');
  }

  const result = await deps.replaceIfGenerated(songId, slug, {
    key: parsed.name,
    storagePath,
    source: 'handmade',
    derivedFromKey: null,
    writer: 'upload',
    chordCount,
    collisions: 0,
    createdBy: uid,
    createdAt: deps.now(),
  });
  if (result === 'missing') throw new HttpsError('not-found', 'Arrangement not found.');
  if (result === 'handmade') {
    throw new HttpsError('failed-precondition', 'Handmade arrangement cannot be replaced.');
  }
  if (result === 'same-file') {
    throw new HttpsError('invalid-argument', 'File already in use by this arrangement.');
  }
  try {
    await deps.deleteFile(result.previousPath);
  } catch (error) {
    console.error('Failed to delete replaced arrangement file', result.previousPath, error);
  }
  try {
    if (!(await deps.fileExists(storagePath))) {
      console.error('New arrangement file vanished after the transaction', storagePath);
    }
  } catch (error) {
    console.error('Failed to re-check new arrangement file', storagePath, error);
  }
  return { songId, key: parsed.name };
}

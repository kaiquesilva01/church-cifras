import { keySlug, parseKey, type KeyName } from '@cifras/chords';
import { HttpsError } from 'firebase-functions/v2/https';

export type ReplaceDeps = {
  getArrangement(
    songId: string,
    slug: string,
  ): Promise<{ source: string; storagePath: string } | null>;
  replaceArrangementDoc(songId: string, slug: string, data: Record<string, unknown>): Promise<void>;
  deleteFile(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
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
  if (typeof songId !== 'string' || songId.length === 0 || songId.includes('/')) {
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

  const existing = await deps.getArrangement(songId, slug);
  if (!existing) throw new HttpsError('not-found', 'Arrangement not found.');
  if (existing.source === 'handmade') {
    throw new HttpsError('failed-precondition', 'Handmade arrangement cannot be replaced.');
  }
  if (!(await deps.fileExists(storagePath))) {
    throw new HttpsError('failed-precondition', 'Uploaded file not found.');
  }

  await deps.replaceArrangementDoc(songId, slug, {
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
  try {
    await deps.deleteFile(existing.storagePath);
  } catch (error) {
    console.error('Failed to delete replaced arrangement file', existing.storagePath, error);
  }
  return { songId, key: parsed.name };
}

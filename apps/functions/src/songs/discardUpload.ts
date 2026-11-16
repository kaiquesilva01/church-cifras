import { keyFromSlug } from '@cifras/chords';
import { HttpsError } from 'firebase-functions/v2/https';

export type DiscardDeps = {
  /** Metadado `uploadedBy` do arquivo, ou 'missing' se ele não existe. */
  getUploader(path: string): Promise<{ uploadedBy: string | undefined } | 'missing'>;
  /** Algum arranjo da música com esse slug aponta para o arquivo? */
  isReferenced(songId: string, slug: string, path: string): Promise<boolean>;
  deleteFile(path: string): Promise<void>;
};

const PATH_RE = /^songs\/([A-Za-z0-9_-]+)\/([A-Za-z]+)-[A-Za-z0-9_-]+\.pdf$/;

// Descarta um PDF órfão enviado pelo próprio usuário (Storage nega delete ao cliente).
export async function discardUpload(
  deps: DiscardDeps,
  input: { uid: string; storagePath: unknown },
): Promise<{ deleted: boolean }> {
  const { uid, storagePath } = input;
  const match = typeof storagePath === 'string' ? PATH_RE.exec(storagePath) : null;
  if (!match || !keyFromSlug(match[2] as string)) {
    throw new HttpsError('invalid-argument', 'Invalid file path.');
  }
  const [path, songId, slug] = [match[0], match[1] as string, match[2] as string];

  const file = await deps.getUploader(path);
  if (file === 'missing') return { deleted: false };
  if (file.uploadedBy !== uid) throw new HttpsError('permission-denied', 'Not your upload.');
  if (await deps.isReferenced(songId, slug, path)) {
    throw new HttpsError('failed-precondition', 'File is in use.');
  }
  await deps.deleteFile(path);
  return { deleted: true };
}

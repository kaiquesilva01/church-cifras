import { artistIdFromName, keySlug, normalizeText, parseKey, type KeyName } from '@cifras/chords';
import { HttpsError } from 'firebase-functions/v2/https';

export type ArrangementInfo = { slug: string; key: string; source: string; storagePath: string };

export type AdminDeps = {
  getSong(id: string): Promise<{ title: string; artistName: string } | null>;
  listArrangements(songId: string): Promise<ArrangementInfo[]>;
  deleteArrangementDoc(songId: string, slug: string): Promise<void>;
  /**
   * Em uma transação: lê os arranjos da música, chama `decide` (que escolhe o alvo ou lança)
   * e apaga o doc do alvo. Duas exclusões concorrentes não deixam só tons gerados.
   */
  deleteArrangementGuarded(
    songId: string,
    decide: (all: ArrangementInfo[]) => ArrangementInfo,
  ): Promise<ArrangementInfo>;
  /** Apaga `songLyrics/{songId}`; doc inexistente não é erro. */
  deleteLyricsDoc(songId: string): Promise<void>;
  deleteSongDoc(songId: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  /** Ids (até 2) das músicas com essa identidade (título normalizado + cantor). */
  findSongsByIdentity(titleNormalized: string, artistId: string): Promise<string[]>;
  updateSong(songId: string, data: Record<string, unknown>): Promise<void>;
  now(): Date;
};

const MAX_LENGTH = 120;

function validSongId(songId: unknown): string {
  if (typeof songId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(songId)) {
    throw new HttpsError('invalid-argument', 'Invalid song.');
  }
  return songId;
}

function validName(value: unknown, label: string): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < 1 || text.length > MAX_LENGTH || normalizeText(text) === '') {
    throw new HttpsError('invalid-argument', `Invalid ${label}.`);
  }
  return text;
}

async function removeFile(deps: AdminDeps, path: string): Promise<void> {
  try {
    await deps.deleteFile(path);
  } catch (error) {
    console.error('Failed to delete arrangement file', path, error);
  }
}

export async function updateSongMeta(
  deps: AdminDeps,
  input: { songId: unknown; title: unknown; artistName: unknown },
): Promise<{ songId: string }> {
  const songId = validSongId(input.songId);
  const title = validName(input.title, 'title');
  const artistName = validName(input.artistName, 'artist');
  const titleNormalized = normalizeText(title);
  const artistId = artistIdFromName(artistName);

  if (!(await deps.getSong(songId))) throw new HttpsError('not-found', 'Song not found.');
  const owners = await deps.findSongsByIdentity(titleNormalized, artistId);
  if (owners.some((id) => id !== songId)) {
    throw new HttpsError('already-exists', 'Já existe uma música com esse nome e cantor.');
  }
  await deps.updateSong(songId, {
    title,
    artistName,
    titleNormalized,
    artistId,
    updatedAt: deps.now(),
  });
  return { songId };
}

export async function deleteArrangement(
  deps: AdminDeps,
  input: { songId: unknown; key: unknown },
): Promise<{ songId: string; key: KeyName }> {
  const songId = validSongId(input.songId);
  const parsed = typeof input.key === 'string' ? parseKey(input.key) : null;
  if (!parsed || parsed.name !== input.key)
    throw new HttpsError('invalid-argument', 'Invalid key.');
  const slug = keySlug(parsed.name);

  const target = await deps.deleteArrangementGuarded(songId, (all) => {
    const found = all.find((a) => a.slug === slug);
    if (!found) throw new HttpsError('not-found', 'Arrangement not found.');
    if (found.source === 'handmade') {
      const others = all.filter((a) => a.slug !== slug);
      const otherHandmade = others.some((a) => a.source === 'handmade');
      const anyGenerated = others.some((a) => a.source === 'generated');
      if (!otherHandmade && anyGenerated) {
        throw new HttpsError(
          'failed-precondition',
          'Não é possível apagar o último PDF feito à mão enquanto houver tons gerados.',
        );
      }
    }
    return found;
  });

  // Doc apagado na transação (o gatilho recalcula keys/handmadeKeys); arquivo órfão é só lixo.
  await removeFile(deps, target.storagePath);
  return { songId, key: parsed.name };
}

export async function deleteSong(
  deps: AdminDeps,
  input: { songId: unknown },
): Promise<{ songId: string }> {
  const songId = validSongId(input.songId);
  // Idempotente: sem música ainda limpa arranjos órfãos e o doc.
  for (const arrangement of await deps.listArrangements(songId)) {
    await deps.deleteArrangementDoc(songId, arrangement.slug);
    await removeFile(deps, arrangement.storagePath);
  }
  await deps.deleteLyricsDoc(songId);
  await deps.deleteSongDoc(songId);
  return { songId };
}

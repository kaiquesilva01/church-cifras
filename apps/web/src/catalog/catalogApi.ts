import {
  artistIdFromName,
  compareKeys,
  keySlug,
  normalizeText,
  type KeyName,
} from '@cifras/chords';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import type { FirebaseServices } from '../lib/firebase';
import type { NewArrangementInput, NewSongInput, SongSummary, UploadPlan } from './types';

export interface CatalogApi {
  subscribeSongs(cb: (songs: SongSummary[]) => void, onError: (e: unknown) => void): () => void;
  findSong(titleNormalized: string, artistId: string): Promise<SongSummary | null>;
  getArrangement(
    songId: string,
    key: KeyName,
  ): Promise<{ source: 'handmade' | 'generated' } | null>;
  /** Reserva o id de uma música nova (o arquivo precisa dele antes do batch). */
  newSongId(): string;
  uploadPdf(songId: string, key: KeyName, file: Blob): Promise<string>;
  deleteFile(path: string): Promise<void>;
  createSongWithArrangement(input: NewSongInput): Promise<string>;
  addArrangement(songId: string, input: NewArrangementInput): Promise<void>;
  replaceArrangement(
    songId: string,
    key: KeyName,
    storagePath: string,
    chordCount: number,
  ): Promise<void>;
  getPdfUrl(storagePath: string): Promise<string>;
}

function toKeys(value: unknown): KeyName[] {
  return Array.isArray(value) ? ([...value] as KeyName[]).sort(compareKeys) : [];
}

function toSongSummary(id: string, data: Record<string, unknown>): SongSummary {
  return {
    id,
    title: String(data.title ?? ''),
    titleNormalized: String(data.titleNormalized ?? ''),
    artistId: String(data.artistId ?? ''),
    artistName: String(data.artistName ?? ''),
    keys: toKeys(data.keys),
    handmadeKeys: toKeys(data.handmadeKeys),
  };
}

function newFileId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export function createCatalogApi({ auth, db, storage, functions }: FirebaseServices): CatalogApi {
  const callReplace = httpsCallable<
    { songId: string; key: KeyName; storagePath: string; chordCount: number },
    unknown
  >(functions, 'replaceArrangement');

  const uid = (): string => {
    const id = auth.currentUser?.uid;
    if (!id) throw new Error('Usuário não autenticado');
    return id;
  };

  const arrangementData = (input: NewArrangementInput, createdBy: string) => ({
    key: input.key,
    storagePath: input.storagePath,
    source: 'handmade',
    derivedFromKey: null,
    writer: 'upload',
    chordCount: input.chordCount,
    collisions: 0,
    createdBy,
    createdAt: serverTimestamp(),
  });

  return {
    subscribeSongs: (cb, onError) =>
      onSnapshot(
        collection(db, 'songs'),
        (snap) => cb(snap.docs.map((d) => toSongSummary(d.id, d.data()))),
        onError,
      ),
    findSong: async (titleNormalized, artistId) => {
      const snap = await getDocs(
        query(
          collection(db, 'songs'),
          where('titleNormalized', '==', titleNormalized),
          where('artistId', '==', artistId),
          limit(1),
        ),
      );
      const first = snap.docs[0];
      return first ? toSongSummary(first.id, first.data()) : null;
    },
    getArrangement: async (songId, key) => {
      const snap = await getDoc(doc(db, 'songs', songId, 'arrangements', keySlug(key)));
      if (!snap.exists()) return null;
      return { source: snap.data().source === 'generated' ? 'generated' : 'handmade' };
    },
    newSongId: () => doc(collection(db, 'songs')).id,
    uploadPdf: async (songId, key, file) => {
      const path = `songs/${songId}/${keySlug(key)}-${newFileId()}.pdf`;
      await uploadBytes(ref(storage, path), file, {
        contentType: 'application/pdf',
        cacheControl: 'public, max-age=31536000, immutable',
      });
      return path;
    },
    deleteFile: (path) => deleteObject(ref(storage, path)),
    createSongWithArrangement: async (input) => {
      const createdBy = uid();
      const songRef = doc(db, 'songs', input.songId);
      const batch = writeBatch(db);
      batch.set(songRef, {
        title: input.title,
        titleNormalized: normalizeText(input.title),
        artistId: artistIdFromName(input.artistName),
        artistName: input.artistName,
        keys: [],
        handmadeKeys: [],
        createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(
        doc(songRef, 'arrangements', keySlug(input.key)),
        arrangementData(input, createdBy),
      );
      await batch.commit();
      return songRef.id;
    },
    addArrangement: async (songId, input) => {
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'songs', songId, 'arrangements', keySlug(input.key)),
        arrangementData(input, uid()),
      );
      await batch.commit();
    },
    replaceArrangement: async (songId, key, storagePath, chordCount) => {
      await callReplace({ songId, key, storagePath, chordCount });
    },
    getPdfUrl: (storagePath) => getDownloadURL(ref(storage, storagePath)),
  };
}

export async function saveUpload(
  api: CatalogApi,
  plan: UploadPlan,
): Promise<{ songId: string; key: KeyName }> {
  const songId = plan.action === 'new-song' ? api.newSongId() : plan.songId;
  const storagePath = await api.uploadPdf(songId, plan.key, plan.file);
  try {
    if (plan.action === 'new-song') {
      await api.createSongWithArrangement({
        songId,
        title: plan.title,
        artistName: plan.artistName,
        key: plan.key,
        storagePath,
        chordCount: plan.chordCount,
      });
    } else if (plan.action === 'add-key') {
      await api.addArrangement(songId, {
        key: plan.key,
        storagePath,
        chordCount: plan.chordCount,
      });
    } else {
      await api.replaceArrangement(songId, plan.key, storagePath, plan.chordCount);
    }
    return { songId, key: plan.key };
  } catch (error) {
    await api.deleteFile(storagePath).catch(() => undefined);
    throw error;
  }
}

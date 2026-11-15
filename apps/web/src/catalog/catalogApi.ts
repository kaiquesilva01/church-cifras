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
import { getBlob, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import type { FirebaseServices } from '../lib/firebase';
import type {
  ArrangementSummary,
  NewArrangementInput,
  NewGeneratedArrangementInput,
  NewSongInput,
  SongSummary,
  UploadPlan,
} from './types';

export interface CatalogApi {
  subscribeSongs(cb: (songs: SongSummary[]) => void, onError: (e: unknown) => void): () => void;
  subscribeArrangements(
    songId: string,
    cb: (arrangements: ArrangementSummary[]) => void,
    onError?: (e: unknown) => void,
  ): () => void;
  findSong(titleNormalized: string, artistId: string): Promise<SongSummary | null>;
  getArrangement(
    songId: string,
    key: KeyName,
  ): Promise<{ source: 'handmade' | 'generated'; storagePath: string } | null>;
  /** Reserva o id de uma música nova (o arquivo precisa dele antes do batch). */
  newSongId(): string;
  uploadPdf(songId: string, key: KeyName, file: Blob): Promise<string>;
  /** Descarta um PDF órfão que o próprio usuário enviou (via callable `discardUpload`). */
  deleteFile(path: string): Promise<void>;
  createSongWithArrangement(input: NewSongInput): Promise<string>;
  addArrangement(songId: string, input: NewArrangementInput): Promise<void>;
  replaceArrangement(
    songId: string,
    key: KeyName,
    storagePath: string,
    chordCount: number,
  ): Promise<void>;
  /** Cria um tom gerado (writer overlay); as regras exigem o tom de origem feito à mão. */
  createGeneratedArrangement(songId: string, input: NewGeneratedArrangementInput): Promise<void>;
  getPdfUrl(storagePath: string): Promise<string>;
  /** Baixa o PDF via getBlob (SDK autenticado, sem CORS de URL assinada). */
  getPdfBytes(storagePath: string): Promise<Uint8Array>;
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

function toArrangement(data: Record<string, unknown>): ArrangementSummary | null {
  const { source, key, storagePath } = data;
  if (source !== 'generated' && source !== 'handmade') return null;
  if (typeof key !== 'string' || typeof storagePath !== 'string' || !storagePath) return null;
  return {
    key,
    source,
    storagePath,
    derivedFromKey: typeof data.derivedFromKey === 'string' ? data.derivedFromKey : null,
    collisions: typeof data.collisions === 'number' ? data.collisions : 0,
  };
}

function newFileId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

export class ArrangementExistsError extends Error {
  constructor() {
    super('Esse tom acabou de ser salvo por outra pessoa.');
    this.name = 'ArrangementExistsError';
  }
}

const errorCode = (error: unknown): unknown =>
  typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;

export function createCatalogApi({ auth, db, storage, functions }: FirebaseServices): CatalogApi {
  const callReplace = httpsCallable<
    { songId: string; key: KeyName; storagePath: string; chordCount: number },
    unknown
  >(functions, 'replaceArrangement');

  const callDiscard = httpsCallable<{ storagePath: string }, unknown>(functions, 'discardUpload');

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
    subscribeArrangements: (songId, cb, onError) =>
      onSnapshot(
        collection(doc(db, 'songs', songId), 'arrangements'),
        (snap) =>
          cb(
            snap.docs
              .map((d) => toArrangement(d.data()))
              .filter((a): a is ArrangementSummary => a !== null)
              .sort((a, b) => compareKeys(a.key, b.key)),
          ),
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
      const source: unknown = snap.data().source;
      if (source !== 'generated' && source !== 'handmade') return null;
      const storagePath = snap.data().storagePath;
      return typeof storagePath === 'string' && storagePath ? { source, storagePath } : null;
    },
    newSongId: () => doc(collection(db, 'songs')).id,
    uploadPdf: async (songId, key, file) => {
      const path = `songs/${songId}/${keySlug(key)}-${newFileId()}.pdf`;
      await uploadBytes(ref(storage, path), file, {
        contentType: 'application/pdf',
        cacheControl: 'public, max-age=31536000, immutable',
        customMetadata: { uploadedBy: uid() },
      });
      return path;
    },
    deleteFile: async (path) => {
      await callDiscard({ storagePath: path });
    },
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
    createGeneratedArrangement: async (songId, input) => {
      const batch = writeBatch(db);
      batch.set(doc(db, 'songs', songId, 'arrangements', keySlug(input.key)), {
        key: input.key,
        storagePath: input.storagePath,
        source: 'generated',
        derivedFromKey: input.derivedFromKey,
        writer: 'overlay',
        chordCount: input.chordCount,
        collisions: input.collisions,
        createdBy: input.createdBy,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
    },
    getPdfUrl: (storagePath) => getDownloadURL(ref(storage, storagePath)),
    getPdfBytes: async (storagePath) =>
      new Uint8Array(await (await getBlob(ref(storage, storagePath))).arrayBuffer()),
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
    const code = errorCode(error);
    if (plan.action === 'replace-generated') {
      if (code === 'functions/failed-precondition') throw new ArrangementExistsError();
    } else if (code === 'permission-denied') {
      // Segundo membro no mesmo tom: o create do arrangement é negado pelas regras.
      const existing = await api.getArrangement(songId, plan.key).catch(() => null);
      if (existing) throw new ArrangementExistsError();
    }
    throw error;
  }
}

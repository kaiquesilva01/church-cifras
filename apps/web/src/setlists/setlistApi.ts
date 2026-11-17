import { KEY_OPTIONS } from '@cifras/chords';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { FirebaseServices } from '../lib/firebase';
import { expiresAtFor } from './dates';
import { applySetlistOp } from './ops';
import type { SetlistSnapshot } from './sync';
import type { Setlist, SetlistItem, SetlistOp } from './types';

export interface SetlistApi {
  subscribeSetlists(cb: (setlists: Setlist[]) => void, onError: (e: unknown) => void): () => void;
  subscribeSetlist(
    id: string,
    cb: (snap: SetlistSnapshot) => void,
    onError: (e: unknown) => void,
  ): () => void;
  createSetlist(input: { date: string; label: string; items: SetlistItem[] }): Promise<string>;
  updateSetlistMeta(id: string, input: { date: string; label: string }): Promise<void>;
  applyOp(id: string, op: SetlistOp): Promise<{ setlist: Setlist; changed: boolean }>;
  deleteSetlist(id: string): Promise<void>;
}

/** O repertório não existe mais (apagado ou expirado) no momento da edição. */
export class SetlistGoneError extends Error {
  constructor() {
    super('Este repertório não existe mais.');
    this.name = 'SetlistGoneError';
  }
}

const VALID_KEYS = new Set<string>([...KEY_OPTIONS.major, ...KEY_OPTIONS.minor]);

function toItems(value: unknown): SetlistItem[] {
  if (!Array.isArray(value)) return [];
  const items: SetlistItem[] = [];
  for (const raw of value as unknown[]) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { id, songId, key } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || !id) continue;
    if (typeof songId !== 'string' || !songId) continue;
    if (typeof key !== 'string' || !VALID_KEYS.has(key)) continue;
    items.push({ id, songId, key });
  }
  return items;
}

const toDate = (value: unknown): Date | null =>
  value instanceof Timestamp ? value.toDate() : null;

function toSetlist(id: string, data: Record<string, unknown>): Setlist {
  return {
    id,
    date: String(data.date ?? ''),
    label: String(data.label ?? ''),
    items: toItems(data.items),
    expiresAt: toDate(data.expiresAt) ?? new Date(0),
    createdAt: toDate(data.createdAt),
  };
}

export function createSetlistApi({ auth, db }: FirebaseServices): SetlistApi {
  const uid = (): string => {
    const id = auth.currentUser?.uid;
    if (!id) throw new Error('Usuário não autenticado');
    return id;
  };

  return {
    subscribeSetlists: (cb, onError) =>
      onSnapshot(
        query(collection(db, 'setlists'), where('expiresAt', '>', Timestamp.fromDate(new Date()))),
        (snap) => cb(snap.docs.map((d) => toSetlist(d.id, d.data()))),
        onError,
      ),
    subscribeSetlist: (id, cb, onError) =>
      onSnapshot(
        doc(db, 'setlists', id),
        { includeMetadataChanges: true },
        (snap) =>
          cb({
            setlist: snap.exists() ? toSetlist(snap.id, snap.data()) : null,
            fromCache: snap.metadata.fromCache,
          }),
        onError,
      ),
    createSetlist: async ({ date, label, items }) => {
      const by = uid();
      const ref = await addDoc(collection(db, 'setlists'), {
        date,
        label,
        items,
        expiresAt: Timestamp.fromDate(expiresAtFor(date)),
        createdBy: by,
        createdAt: serverTimestamp(),
        updatedBy: by,
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },
    updateSetlistMeta: async (id, { date, label }) => {
      await updateDoc(doc(db, 'setlists', id), {
        date,
        label,
        expiresAt: Timestamp.fromDate(expiresAtFor(date)),
        updatedBy: uid(),
        updatedAt: serverTimestamp(),
      });
    },
    applyOp: async (id, op) => {
      const by = uid();
      const ref = doc(db, 'setlists', id);
      return runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new SetlistGoneError();
        const current = toSetlist(snap.id, snap.data());
        const { items, changed } = applySetlistOp(current.items, op);
        if (!changed) return { setlist: current, changed: false };
        tx.update(ref, { items, updatedBy: by, updatedAt: serverTimestamp() });
        return { setlist: { ...current, items }, changed: true };
      });
    },
    deleteSetlist: async (id) => {
      await deleteDoc(doc(db, 'setlists', id));
    },
  };
}

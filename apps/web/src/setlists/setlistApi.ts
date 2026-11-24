import { KEY_OPTIONS } from '@cifras/chords';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  deleteField,
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
import { originForHostname, parseOrigin } from './origin';
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
  createSetlist(input: {
    date: string;
    label: string;
    items: SetlistItem[];
    rehearsalAt?: Date | null;
  }): Promise<string>;
  updateSetlistMeta(
    id: string,
    input: { date: string; label: string; rehearsalAt: Date | null },
  ): Promise<void>;
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
  const setlist: Setlist = {
    id,
    date: String(data.date ?? ''),
    label: String(data.label ?? ''),
    items: toItems(data.items),
    expiresAt: toDate(data.expiresAt) ?? new Date(0),
    createdAt: toDate(data.createdAt),
  };
  // Campos de #100: repertório antigo não os tem; origem fora da lista é ignorada.
  const rehearsalAt = toDate(data.rehearsalAt);
  if (rehearsalAt) setlist.rehearsalAt = rehearsalAt;
  const origin = parseOrigin(data.origin);
  if (origin) setlist.origin = origin;
  return setlist;
}

export function createSetlistApi(
  { auth, db }: FirebaseServices,
  { ministryId, hostname = window.location.hostname }: { ministryId: string; hostname?: string },
): SetlistApi {
  // Repertórios vivem no ministério atual: `ministries/{mid}/setlists`. A raiz `setlists` é congelada.
  const setlistsCol = () => collection(db, 'ministries', ministryId, 'setlists');
  const setlistRef = (id: string) => doc(db, 'ministries', ministryId, 'setlists', id);
  const uid = (): string => {
    const id = auth.currentUser?.uid;
    if (!id) throw new Error('Usuário não autenticado');
    return id;
  };

  return {
    subscribeSetlists: (cb, onError) =>
      onSnapshot(
        query(setlistsCol(), where('expiresAt', '>', Timestamp.fromDate(new Date()))),
        (snap) => cb(snap.docs.map((d) => toSetlist(d.id, d.data()))),
        onError,
      ),
    subscribeSetlist: (id, cb, onError) =>
      onSnapshot(
        setlistRef(id),
        { includeMetadataChanges: true },
        (snap) =>
          cb({
            setlist: snap.exists() ? toSetlist(snap.id, snap.data()) : null,
            fromCache: snap.metadata.fromCache,
          }),
        onError,
      ),
    createSetlist: async ({ date, label, items, rehearsalAt }) => {
      const by = uid();
      const ref = await addDoc(setlistsCol(), {
        date,
        label,
        items,
        ...(rehearsalAt ? { rehearsalAt: Timestamp.fromDate(rehearsalAt) } : {}),
        expiresAt: Timestamp.fromDate(expiresAtFor(date)),
        origin: originForHostname(hostname),
        createdBy: by,
        createdAt: serverTimestamp(),
        updatedBy: by,
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    },
    updateSetlistMeta: async (id, { date, label, rehearsalAt }) => {
      await updateDoc(setlistRef(id), {
        date,
        label,
        // sempre enviado: trocar a data revalida o ensaio gravado; limpar é `deleteField()`, nunca `null`
        rehearsalAt: rehearsalAt ? Timestamp.fromDate(rehearsalAt) : deleteField(),
        expiresAt: Timestamp.fromDate(expiresAtFor(date)),
        updatedBy: uid(),
        updatedAt: serverTimestamp(),
      });
    },
    applyOp: async (id, op) => {
      const by = uid();
      const ref = setlistRef(id);
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
      await deleteDoc(setlistRef(id));
    },
  };
}

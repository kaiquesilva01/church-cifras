import { vi } from 'vitest';
import { SetlistGoneError, type SetlistApi } from '../setlists/setlistApi';
import { applySetlistOp } from '../setlists/ops';
import type { SetlistSnapshot } from '../setlists/sync';
import type { Setlist } from '../setlists/types';

export function makeSetlist(overrides: Partial<Setlist> & { id: string }): Setlist {
  return {
    date: '2026-11-20',
    label: 'Culto',
    items: [],
    expiresAt: new Date('2026-12-20T00:00:00Z'),
    createdAt: new Date('2026-11-16T00:00:00Z'),
    ...overrides,
  };
}

export interface FakeSetlistApi extends SetlistApi {
  /** Simula um snapshot de outra pessoa para um repertório. */
  push(id: string, snap: SetlistSnapshot): void;
  /** Simula uma nova lista de repertórios vinda do servidor. */
  pushList(setlists: Setlist[]): void;
}

export function fakeSetlistApi(
  initial: Setlist[] = [],
  overrides: Partial<SetlistApi> = {},
): FakeSetlistApi {
  let setlists = [...initial];
  let nextId = 1;
  const listListeners = new Set<(s: Setlist[]) => void>();
  const docListeners = new Map<string, Set<(s: SetlistSnapshot) => void>>();

  const emitDoc = (id: string) => {
    const setlist = setlists.find((s) => s.id === id) ?? null;
    docListeners.get(id)?.forEach((cb) => cb({ setlist, fromCache: false }));
  };
  const emitList = () => listListeners.forEach((cb) => cb(setlists));

  return {
    subscribeSetlists: (cb) => {
      listListeners.add(cb);
      cb(setlists);
      return () => listListeners.delete(cb);
    },
    subscribeSetlist: (id, cb) => {
      const set = docListeners.get(id) ?? new Set();
      docListeners.set(id, set);
      set.add(cb);
      cb({ setlist: setlists.find((s) => s.id === id) ?? null, fromCache: false });
      return () => set.delete(cb);
    },
    createSetlist: vi.fn(({ date, label, items }) => {
      const id = `new-${nextId++}`;
      setlists = [...setlists, makeSetlist({ id, date, label, items })];
      emitList();
      return Promise.resolve(id);
    }),
    updateSetlistMeta: vi.fn((id, { date, label }) => {
      setlists = setlists.map((s) => (s.id === id ? { ...s, date, label } : s));
      emitList();
      emitDoc(id);
      return Promise.resolve();
    }),
    applyOp: vi.fn((id, op) => {
      const current = setlists.find((s) => s.id === id);
      if (!current) return Promise.reject(new SetlistGoneError());
      try {
        const { items, changed } = applySetlistOp(current.items, op);
        if (!changed) return Promise.resolve({ setlist: current, changed: false });
        const setlist = { ...current, items };
        setlists = setlists.map((s) => (s.id === id ? setlist : s));
        emitList();
        emitDoc(id);
        return Promise.resolve({ setlist, changed: true });
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }),
    deleteSetlist: vi.fn((id) => {
      setlists = setlists.filter((s) => s.id !== id);
      emitList();
      emitDoc(id);
      return Promise.resolve();
    }),
    ...overrides,
    push: (id, snap) => {
      if (snap.setlist) {
        setlists = setlists.some((s) => s.id === id)
          ? setlists.map((s) => (s.id === id ? (snap.setlist as Setlist) : s))
          : [...setlists, snap.setlist];
      } else {
        setlists = setlists.filter((s) => s.id !== id);
      }
      docListeners.get(id)?.forEach((cb) => cb(snap));
      emitList();
    },
    pushList: (next) => {
      setlists = [...next];
      emitList();
    },
  };
}

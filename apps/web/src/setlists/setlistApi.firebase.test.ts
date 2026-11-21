import { beforeEach, describe, expect, it, vi } from 'vitest';

const txGet = vi.fn();
const txUpdate = vi.fn();

vi.mock('firebase/firestore', () => {
  class Timestamp {
    constructor(private readonly d: Date) {}
    static fromDate(d: Date) {
      return new Timestamp(d);
    }
    toDate() {
      return this.d;
    }
  }
  return {
    Timestamp,
    addDoc: vi.fn(() => Promise.resolve({ id: 'new1' })),
    collection: vi.fn((_db: unknown, name: string) => ({ path: name })),
    deleteDoc: vi.fn(() => Promise.resolve()),
    doc: vi.fn((_db: unknown, ...segments: string[]) => ({
      id: segments[segments.length - 1],
      path: segments.join('/'),
    })),
    onSnapshot: vi.fn(),
    query: vi.fn((...parts: unknown[]) => ({ parts })),
    runTransaction: vi.fn((_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ get: txGet, update: txUpdate }),
    ),
    serverTimestamp: vi.fn(() => '<ts>'),
    updateDoc: vi.fn(() => Promise.resolve()),
    where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  };
});

import {
  Timestamp,
  addDoc,
  deleteDoc,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { FirebaseServices } from '../lib/firebase';
import { expiresAtFor } from './dates';
import { SetlistFullError } from './ops';
import { SetlistGoneError, createSetlistApi } from './setlistApi';
import { MAX_ITEMS } from './types';

const services = { auth: { currentUser: { uid: 'u1' } }, db: {} } as unknown as FirebaseServices;
const api = () => createSetlistApi(services);

const stored = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  exists: () => true,
  id: 'l1',
  data: () => ({
    date: '2026-11-20',
    label: 'Culto',
    items,
    expiresAt: Timestamp.fromDate(new Date('2026-12-20T00:00:00Z')),
    createdAt: Timestamp.fromDate(new Date('2026-11-16T00:00:00Z')),
    ...extra,
  }),
});

describe('createSetlistApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribeSetlists queries by expiresAt > now and converts timestamps', () => {
    const unsub = vi.fn();
    vi.mocked(onSnapshot).mockImplementationOnce(((_q: unknown, next: (s: unknown) => void) => {
      next({ docs: [stored([{ id: 'a', songId: 's1', key: 'G' }])] });
      return unsub;
    }) as never);
    const cb = vi.fn();
    const stop = api().subscribeSetlists(cb, vi.fn());
    expect(where).toHaveBeenCalledWith('expiresAt', '>', expect.any(Timestamp));
    expect(cb).toHaveBeenCalledWith([
      {
        id: 'l1',
        date: '2026-11-20',
        label: 'Culto',
        items: [{ id: 'a', songId: 's1', key: 'G' }],
        expiresAt: new Date('2026-12-20T00:00:00Z'),
        createdAt: new Date('2026-11-16T00:00:00Z'),
      },
    ]);
    expect(stop).toBe(unsub);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('subscribeSetlist uses includeMetadataChanges and delivers fromCache', () => {
    const snap = (exists: boolean, fromCache: boolean) => ({
      ...stored([]),
      exists: () => exists,
      metadata: { fromCache },
    });
    vi.mocked(onSnapshot).mockImplementationOnce(((
      _ref: unknown,
      _opts: unknown,
      next: (s: unknown) => void,
    ) => {
      next(snap(true, true));
      next(snap(false, false));
      return () => undefined;
    }) as never);
    const cb = vi.fn();
    api().subscribeSetlist('l1', cb, vi.fn());
    expect(vi.mocked(onSnapshot).mock.calls[0]?.[0]).toMatchObject({ path: 'setlists/l1' });
    expect(vi.mocked(onSnapshot).mock.calls[0]?.[1]).toEqual({ includeMetadataChanges: true });
    expect(cb).toHaveBeenNthCalledWith(1, {
      setlist: expect.objectContaining({ id: 'l1', label: 'Culto' }) as unknown,
      fromCache: true,
    });
    expect(cb).toHaveBeenNthCalledWith(2, { setlist: null, fromCache: false });
  });

  it('drops invalid items during conversion', () => {
    vi.mocked(onSnapshot).mockImplementationOnce(((
      _ref: unknown,
      _opts: unknown,
      next: (s: unknown) => void,
    ) => {
      next({
        ...stored([
          { id: 'a', songId: 's1', key: 'G' },
          { id: 'b', key: 'G' },
          { id: 'c', songId: 's1', key: 'H' },
          { id: 'd', songId: 's2', key: 'F#m' },
        ]),
        metadata: { fromCache: false },
      });
      return () => undefined;
    }) as never);
    const cb = vi.fn();
    api().subscribeSetlist('l1', cb, vi.fn());
    const arg = cb.mock.calls[0]?.[0] as { setlist: { items: { id: string }[] } };
    expect(arg.setlist.items.map((i) => i.id)).toEqual(['a', 'd']);
  });

  it('createSetlist writes the full doc and returns the id', async () => {
    const id = await api().createSetlist({
      date: '2026-11-20',
      label: 'Culto',
      items: [{ id: 'a', songId: 's1', key: 'G' }],
    });
    expect(id).toBe('new1');
    const [ref, data] = vi.mocked(addDoc).mock.calls[0] as unknown as [
      { path: string },
      Record<string, unknown>,
    ];
    expect(ref.path).toBe('setlists');
    expect(data).toEqual({
      date: '2026-11-20',
      label: 'Culto',
      items: [{ id: 'a', songId: 's1', key: 'G' }],
      expiresAt: Timestamp.fromDate(expiresAtFor('2026-11-20')),
      createdBy: 'u1',
      createdAt: '<ts>',
      updatedBy: 'u1',
      updatedAt: '<ts>',
    });
  });

  it('createSetlist requires an authenticated user', async () => {
    const anon = createSetlistApi({ auth: { currentUser: null }, db: {} } as never);
    await expect(anon.createSetlist({ date: '2026-11-20', label: '', items: [] })).rejects.toThrow(
      'Usuário não autenticado',
    );
  });

  it('updateSetlistMeta rewrites meta without createdBy/createdAt', async () => {
    await api().updateSetlistMeta('l1', { date: '2026-12-01', label: 'Ceia' });
    const [ref, data] = vi.mocked(updateDoc).mock.calls[0] as unknown as [
      { path: string },
      Record<string, unknown>,
    ];
    expect(ref.path).toBe('setlists/l1');
    expect(data).toEqual({
      date: '2026-12-01',
      label: 'Ceia',
      expiresAt: Timestamp.fromDate(expiresAtFor('2026-12-01')),
      updatedBy: 'u1',
      updatedAt: '<ts>',
    });
    expect(data).not.toHaveProperty('createdBy');
    expect(data).not.toHaveProperty('createdAt');
  });

  it('applyOp reads inside the transaction and applies to the latest state', async () => {
    txGet.mockResolvedValueOnce(stored([{ id: 'other', songId: 's9', key: 'D' }]));
    const result = await api().applyOp('l1', {
      type: 'add',
      item: { id: 'mine', songId: 's1', key: 'G' },
    });
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(txGet).toHaveBeenCalledTimes(1);
    expect(result.changed).toBe(true);
    expect(result.setlist.items.map((i) => i.id)).toEqual(['other', 'mine']);
    expect(txUpdate).toHaveBeenCalledWith(expect.objectContaining({ path: 'setlists/l1' }), {
      items: [
        { id: 'other', songId: 's9', key: 'D' },
        { id: 'mine', songId: 's1', key: 'G' },
      ],
      updatedBy: 'u1',
      updatedAt: '<ts>',
    });
  });

  it('applyOp rejects (does not throw) when unauthenticated', async () => {
    const anon = createSetlistApi({ auth: { currentUser: null }, db: {} } as never);
    let promise: Promise<unknown> | undefined;
    expect(() => {
      promise = anon.applyOp('l1', { type: 'remove', itemId: 'a' });
    }).not.toThrow();
    await expect(promise).rejects.toThrow();
  });

  it('applyOp throws SetlistGoneError when the doc is missing', async () => {
    txGet.mockResolvedValueOnce({ exists: () => false });
    await expect(api().applyOp('l1', { type: 'remove', itemId: 'a' })).rejects.toBeInstanceOf(
      SetlistGoneError,
    );
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('applyOp writes nothing when the op changes nothing', async () => {
    txGet.mockResolvedValueOnce(stored([{ id: 'a', songId: 's1', key: 'G' }]));
    const result = await api().applyOp('l1', { type: 'remove', itemId: 'zzz' });
    expect(result.changed).toBe(false);
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('applyOp propagates SetlistFullError', async () => {
    const items = Array.from({ length: MAX_ITEMS }, (_, i) => ({
      id: `i${i}`,
      songId: 's1',
      key: 'G',
    }));
    txGet.mockResolvedValueOnce(stored(items));
    await expect(
      api().applyOp('l1', { type: 'add', item: { id: 'x', songId: 's1', key: 'G' } }),
    ).rejects.toBeInstanceOf(SetlistFullError);
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('lê rehearsalAt e origin, e ignora o que falta ou é inválido', () => {
    const at = new Date('2026-11-22T21:30:00Z');
    const base = {
      id: 'l1',
      date: '2026-11-20',
      label: 'Culto',
      items: [],
      expiresAt: new Date('2026-12-20T00:00:00Z'),
      createdAt: new Date('2026-11-16T00:00:00Z'),
    };
    // Entrega um snapshot com `extra` no data e devolve o `setlist` que chegou ao callback.
    const read = (extra: Record<string, unknown>) => {
      const cb = vi.fn();
      vi.mocked(onSnapshot).mockImplementationOnce(((
        _ref: unknown,
        _opts: unknown,
        next: (s: unknown) => void,
      ) => {
        next({ ...stored([], extra), metadata: { fromCache: false } });
        return () => undefined;
      }) as never);
      api().subscribeSetlist('l1', cb, vi.fn());
      return (cb.mock.calls[0]![0] as { setlist: unknown }).setlist;
    };

    // A: campos novos válidos
    expect(read({ rehearsalAt: Timestamp.fromDate(at), origin: 'teste' })).toEqual({
      ...base,
      rehearsalAt: at,
      origin: 'teste',
    });

    // B: repertório antigo, sem os campos novos
    const old = read({});
    expect(old).toEqual(base);
    expect(old).not.toHaveProperty('rehearsalAt');
    expect(old).not.toHaveProperty('origin');

    // C: origem desconhecida é ignorada
    const unknown = read({ origin: 'outro' });
    expect(unknown).toEqual(base);
    expect(unknown).not.toHaveProperty('origin');
  });

  it('deleteSetlist deletes the doc', async () => {
    await api().deleteSetlist('l1');
    expect(vi.mocked(deleteDoc).mock.calls[0]?.[0]).toMatchObject({ path: 'setlists/l1' });
  });
});

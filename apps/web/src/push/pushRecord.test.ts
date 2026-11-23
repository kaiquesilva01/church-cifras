import { describe, expect, it, vi } from 'vitest';
import { PUSH_RECORD_KEY, createPushRecordStore } from './pushRecord';

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  } as unknown as Storage;
}

describe('createPushRecordStore', () => {
  it('round-trips the record under the versioned key', () => {
    const storage = memory();
    const store = createPushRecordStore(storage);
    expect(store.read()).toBeNull();
    store.write({ token: 'tok', registeredAt: 10 });
    expect(storage.getItem(PUSH_RECORD_KEY)).toContain('"token":"tok"');
    expect(store.read()).toEqual({ token: 'tok', registeredAt: 10 });
    store.clear();
    expect(store.read()).toBeNull();
  });

  it('ignores corrupt or foreign values', () => {
    const storage = memory();
    storage.setItem(PUSH_RECORD_KEY, '{not json');
    expect(createPushRecordStore(storage).read()).toBeNull();
    storage.setItem(PUSH_RECORD_KEY, JSON.stringify({ token: '', registeredAt: 1 }));
    expect(createPushRecordStore(storage).read()).toBeNull();
  });

  it('never throws without storage or when storage throws', () => {
    const broken = {
      getItem: vi.fn(() => {
        throw new Error('denied');
      }),
      setItem: vi.fn(() => {
        throw new Error('full');
      }),
      removeItem: vi.fn(() => {
        throw new Error('x');
      }),
    } as unknown as Storage;
    const store = createPushRecordStore(broken);
    expect(store.read()).toBeNull();
    expect(() => store.write({ token: 't', registeredAt: 1 })).not.toThrow();
    expect(() => store.clear()).not.toThrow();
    expect(createPushRecordStore(undefined).read()).toBeNull();
  });
});

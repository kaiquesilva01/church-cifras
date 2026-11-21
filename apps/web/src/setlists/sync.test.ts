import { describe, expect, it } from 'vitest';
import type { Setlist } from './types';
import { hasChanges, initialSync, isRemoved, syncReducer, type SyncState } from './sync';

const sl = (label: string, ids: string[] = []): Setlist => ({
  id: 'r1',
  date: '2026-11-22',
  label,
  items: ids.map((id) => ({ id, songId: `s-${id}`, key: 'C' as const })),
  expiresAt: new Date('2026-12-22'),
  createdAt: new Date('2026-11-01'),
});

const server = (s: Setlist | null) => ({
  type: 'snapshot' as const,
  snap: { setlist: s, fromCache: false },
});
const cache = (s: Setlist | null) => ({
  type: 'snapshot' as const,
  snap: { setlist: s, fromCache: true },
});

describe('syncReducer', () => {
  it('starts loading', () => {
    expect(initialSync.phase).toBe('loading');
  });

  it('cache-only null stays loading', () => {
    const s = syncReducer(initialSync, cache(null));
    expect(s.phase).toBe('loading');
    expect(s.synced).toBe(false);
  });

  it('a snapshot after not-found shows it without a false banner', () => {
    const nf = syncReducer(initialSync, server(null));
    const s = syncReducer(nf, server(sl('Novo')));
    expect(s.shown?.label).toBe('Novo');
    expect(hasChanges(s)).toBe(false);
  });

  it('server null with no shown is not-found', () => {
    const s = syncReducer(initialSync, server(null));
    expect(s.phase).toBe('not-found');
    expect(s.synced).toBe(true);
  });

  it('before first server snapshot, shown follows latest and cache does not sync', () => {
    let s = syncReducer(initialSync, cache(sl('A')));
    expect(s.phase).toBe('ready');
    expect(s.synced).toBe(false);
    s = syncReducer(s, cache(sl('B')));
    expect(s.shown?.label).toBe('B');
    expect(s.latest?.label).toBe('B');
    expect(hasChanges(s)).toBe(false);
    expect(s.synced).toBe(false);
  });

  it('first server snapshot syncs and shows it', () => {
    let s = syncReducer(initialSync, cache(sl('A')));
    s = syncReducer(s, server(sl('B')));
    expect(s.synced).toBe(true);
    expect(s.shown?.label).toBe('B');
    expect(hasChanges(s)).toBe(false);
  });

  it('after synced, a different snapshot only changes latest', () => {
    let s = syncReducer(initialSync, server(sl('A')));
    s = syncReducer(s, server(sl('B')));
    expect(s.shown?.label).toBe('A');
    expect(s.latest?.label).toBe('B');
    expect(hasChanges(s)).toBe(true);
  });

  it('reverted change clears the banner', () => {
    let s = syncReducer(initialSync, server(sl('A')));
    s = syncReducer(s, server(sl('B')));
    s = syncReducer(s, server(sl('A')));
    expect(hasChanges(s)).toBe(false);
  });

  it('accept copies latest to shown; no-op with null latest', () => {
    let s = syncReducer(initialSync, server(sl('A')));
    s = syncReducer(s, server(sl('B')));
    s = syncReducer(s, { type: 'accept' });
    expect(s.shown?.label).toBe('B');
    expect(hasChanges(s)).toBe(false);
    const removed = syncReducer(syncReducer(initialSync, server(sl('A'))), server(null));
    expect(syncReducer(removed, { type: 'accept' })).toEqual(removed);
  });

  it('server null after ready keeps shown, clears latest, isRemoved', () => {
    let s = syncReducer(initialSync, server(sl('A')));
    s = syncReducer(s, server(null));
    expect(s.shown?.label).toBe('A');
    expect(s.latest).toBeNull();
    expect(s.phase).toBe('ready');
    expect(isRemoved(s)).toBe(true);
    expect(hasChanges(s)).toBe(false);
  });

  it('isRemoved is false normally and when not-found', () => {
    expect(isRemoved(syncReducer(initialSync, server(sl('A'))))).toBe(false);
    expect(isRemoved(syncReducer(initialSync, server(null)))).toBe(false);
  });

  it('adopt equalizes shown and latest', () => {
    const s = syncReducer(syncReducer(initialSync, server(sl('A'))), {
      type: 'adopt',
      setlist: sl('Z'),
    });
    expect(s.shown?.label).toBe('Z');
    expect(s.latest?.label).toBe('Z');
  });

  it('optimistic changes only shown', () => {
    const base: SyncState = syncReducer(initialSync, server(sl('A')));
    const s = syncReducer(base, { type: 'optimistic', setlist: sl('A', ['x']) });
    expect(s.shown?.items).toHaveLength(1);
    expect(s.latest?.items).toHaveLength(0);
  });

  it('a rehearsal-only change from another person counts as a change', () => {
    const at = new Date('2026-11-22T21:30:00Z');
    let s = syncReducer(initialSync, server({ ...sl('A'), rehearsalAt: at }));
    s = syncReducer(s, server({ ...sl('A'), rehearsalAt: new Date('2026-11-22T22:00:00Z') }));
    expect(hasChanges(s)).toBe(true);
    s = syncReducer(s, server({ ...sl('A'), rehearsalAt: at }));
    expect(hasChanges(s)).toBe(false);
  });
});

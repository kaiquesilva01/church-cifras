import { describe, expect, it } from 'vitest';
import { groupSetlists, nextCultos, sameContent } from './selectors';
import type { Setlist } from './types';

const now = new Date('2026-11-16T12:00:00Z');
const today = '2026-11-16';
const future = new Date('2027-01-01T00:00:00Z');

const make = (
  id: string,
  date: string,
  createdAt: Date | null = new Date(0),
  extra: Partial<Setlist> = {},
): Setlist => ({
  id,
  date,
  label: 'Culto',
  items: [],
  expiresAt: future,
  createdAt,
  ...extra,
});

describe('groupSetlists', () => {
  it('hides expired, splits upcoming and recent, orders them', () => {
    const list = [
      make('old', '2026-11-10'),
      make('older', '2026-11-05'),
      make('today', '2026-11-16'),
      make('later', '2026-11-22'),
      make('gone', '2026-10-01', new Date(0), { expiresAt: now }),
    ];
    const { upcoming, recent } = groupSetlists(list, today, now);
    expect(upcoming.map((s) => s.id)).toEqual(['today', 'later']);
    expect(recent.map((s) => s.id)).toEqual(['old', 'older']);
  });

  it('orders same date by createdAt asc, null last, then id', () => {
    const list = [
      make('d', '2026-11-22', null),
      make('c', '2026-11-22', new Date(2)),
      make('b', '2026-11-22', new Date(1)),
      make('a', '2026-11-22', new Date(1)),
    ];
    expect(groupSetlists(list, today, now).upcoming.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('nextCultos', () => {
  it('returns all setlists of the smallest date >= today', () => {
    const list = [
      make('x', '2026-11-22'),
      make('y', '2026-11-19'),
      make('z', '2026-11-19', new Date(5)),
      make('p', '2026-11-10'),
    ];
    expect(nextCultos(list, today, now).map((s) => s.id)).toEqual(['y', 'z']);
  });

  it('returns [] when there is none', () => {
    expect(nextCultos([make('p', '2026-11-10')], today, now)).toEqual([]);
  });
});

describe('sameContent', () => {
  const item = { id: 'i1', songId: 's1', key: 'C' as const };
  const a = make('a', '2026-11-22', new Date(1), { items: [item] });

  it('ignores expiresAt and createdAt', () => {
    const b = { ...a, expiresAt: new Date(9), createdAt: null };
    expect(sameContent(a, b)).toBe(true);
  });

  it('detects label, date and item changes', () => {
    expect(sameContent(a, { ...a, label: 'Outro' })).toBe(false);
    expect(sameContent(a, { ...a, date: '2026-11-23' })).toBe(false);
    expect(sameContent(a, { ...a, items: [{ ...item, key: 'D' }] })).toBe(false);
    expect(sameContent(a, { ...a, items: [{ ...item, id: 'i2' }] })).toBe(false);
    expect(sameContent(a, { ...a, items: [] })).toBe(false);
  });

  it('detects a rehearsal change, including clearing it', () => {
    const withHour = { ...a, rehearsalAt: new Date('2026-11-22T21:30:00Z') };
    expect(sameContent(a, withHour)).toBe(false);
    expect(sameContent(withHour, { ...a, rehearsalAt: new Date('2026-11-22T22:00:00Z') })).toBe(
      false,
    );
    expect(sameContent(withHour, { ...a, rehearsalAt: new Date('2026-11-22T21:30:00Z') })).toBe(
      true,
    );
    expect(sameContent(withHour, a)).toBe(false);
  });

  it('handles null', () => {
    expect(sameContent(null, null)).toBe(true);
    expect(sameContent(null, a)).toBe(false);
    expect(sameContent(a, null)).toBe(false);
  });
});

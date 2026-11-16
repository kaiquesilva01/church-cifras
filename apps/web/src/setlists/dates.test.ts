import { describe, expect, it } from 'vitest';
import {
  defaultCultoDate,
  defaultLabel,
  expiresAtFor,
  isExpired,
  isTooOld,
  todayLocal,
} from './dates';
import type { Setlist } from './types';

describe('dates', () => {
  it('todayLocal uses America/Sao_Paulo', () => {
    expect(todayLocal(new Date('2026-11-23T02:30:00Z'))).toBe('2026-11-22');
    expect(todayLocal(new Date('2026-11-22T03:00:00Z'))).toBe('2026-11-22');
  });

  it('expiresAtFor is end of day (UTC-3) plus 30 days', () => {
    expect(expiresAtFor('2026-11-22').toISOString()).toBe('2026-12-23T03:00:00.000Z');
    expect(expiresAtFor('2026-12-15').toISOString()).toBe('2027-01-15T03:00:00.000Z');
    expect(expiresAtFor('2028-02-01').toISOString()).toBe('2028-03-03T03:00:00.000Z');
  });

  it('defaultCultoDate picks the next Thursday or Sunday', () => {
    expect(defaultCultoDate('2026-11-16')).toBe('2026-11-19');
    expect(defaultCultoDate('2026-11-19')).toBe('2026-11-19');
    expect(defaultCultoDate('2026-11-20')).toBe('2026-11-22');
    expect(defaultCultoDate('2026-11-22')).toBe('2026-11-22');
    expect(defaultCultoDate('2026-11-23')).toBe('2026-11-26');
  });

  it('defaultLabel names the weekday', () => {
    expect(defaultLabel('2026-11-22')).toBe('Domingo');
    expect(defaultLabel('2026-11-19')).toBe('Quinta');
    expect(defaultLabel('2026-11-18')).toBe('Quarta');
  });

  it('isTooOld blocks dates before 29 days ago', () => {
    expect(isTooOld('2026-10-17', '2026-11-16')).toBe(true);
    expect(isTooOld('2026-10-18', '2026-11-16')).toBe(false);
  });

  it('isExpired is true when expiresAt equals now', () => {
    const now = new Date('2026-12-23T03:00:00Z');
    const base: Setlist = {
      id: 'a',
      date: '2026-11-22',
      label: 'Domingo',
      items: [],
      expiresAt: now,
      createdAt: null,
    };
    expect(isExpired(base, now)).toBe(true);
    expect(isExpired({ ...base, expiresAt: new Date(now.getTime() + 1) }, now)).toBe(false);
  });
});

import { KEY_OPTIONS, type KeyName } from './keys';
import { normalizeText } from './metadata';

const ORDERED_KEYS: readonly KeyName[] = [...KEY_OPTIONS.major, ...KEY_OPTIONS.minor];

export function keySlug(key: KeyName): string {
  return key.replace('#', 's');
}

export function keyFromSlug(slug: string): KeyName | null {
  return ORDERED_KEYS.find((key) => keySlug(key) === slug) ?? null;
}

export function compareKeys(a: KeyName, b: KeyName): number {
  const ia = ORDERED_KEYS.indexOf(a);
  const ib = ORDERED_KEYS.indexOf(b);
  return (ia === -1 ? ORDERED_KEYS.length : ia) - (ib === -1 ? ORDERED_KEYS.length : ib);
}

export function artistIdFromName(name: string): string {
  return normalizeText(name).replace(/ /g, '-');
}

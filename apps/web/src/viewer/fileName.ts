// Windows-invalid characters plus control characters.
// eslint-disable-next-line no-control-regex
const INVALID = /[\\/:*?"<>|\u0000-\u001f]/g;

const MAX_PART = 80;
const FALLBACK = 'cifra';

const clean = (text: string): string =>
  text.replace(INVALID, '').replace(/\s+/g, ' ').trim().slice(0, MAX_PART).trim() || FALLBACK;

export function pdfFileName(title: string, artist: string, key: string): string {
  return `${clean(title)} - ${clean(artist)} (${clean(key)}).pdf`;
}

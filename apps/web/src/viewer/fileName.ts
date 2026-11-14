// Windows-invalid characters plus control characters.
// eslint-disable-next-line no-control-regex
const INVALID = /[\\/:*?"<>|\u0000-\u001f]/g;

const clean = (text: string): string => text.replace(INVALID, '').replace(/\s+/g, ' ').trim();

export function pdfFileName(title: string, artist: string, key: string): string {
  return `${clean(title)} - ${clean(artist)} (${clean(key)}).pdf`;
}

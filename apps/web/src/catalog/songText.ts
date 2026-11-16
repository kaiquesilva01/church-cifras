import { normalizeText } from '@cifras/chords';

export const MAX_TEXT = 120;

const NO_TEXT = 'Use letras ou números no nome.';

function validate(value: string, empty: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return empty;
  if (normalizeText(trimmed) === '') return NO_TEXT;
  if (trimmed.length > MAX_TEXT) return `Use no máximo ${MAX_TEXT} caracteres.`;
  return null;
}

/** Shared by the upload form and the edit-song dialog. */
export const validateTitle = (value: string): string | null =>
  validate(value, 'Informe o nome da música.');
export const validateArtist = (value: string): string | null =>
  validate(value, 'Informe o cantor.');

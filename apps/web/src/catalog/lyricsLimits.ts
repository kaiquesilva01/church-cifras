/** Tamanho máximo da letra gravada em `songLyrics/{songId}` (a regra do Firestore usa o mesmo teto). */
export const MAX_LYRICS_CHARS = 20_000;

/** Mínimo de caracteres normalizados para buscar na letra (abaixo disso a busca não roda). */
export const MIN_LYRICS_QUERY = 3;

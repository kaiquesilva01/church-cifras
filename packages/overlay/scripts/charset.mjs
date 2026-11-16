// Code points kept in the shipped substitute fonts: chord glyphs, key labels, ASCII punctuation,
// Latin-1 (U+00A0-U+00FF) and the dashes/ellipsis common in song titles.
const LATIN1 = Array.from({ length: 0x100 - 0xa0 }, (_, i) => String.fromCodePoint(0xa0 + i)).join(
  '',
);

export const SUBSET_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#()/+-°ºø:[]|.,; '" +
  LATIN1 +
  '–—…';

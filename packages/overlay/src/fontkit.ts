import * as namespace from '@pdf-lib/fontkit';

export type FontkitFont = namespace.Font;

// The package's ES build (what browser bundlers pick) only has a default export holding the
// fontkit object; its CommonJS build exposes the same members as named exports. Read both.
export function resolveFontkit(ns: typeof namespace): typeof namespace {
  const withDefault = ns as typeof namespace & { default?: typeof namespace };
  return withDefault.default ?? ns;
}

export const fontkit: typeof namespace = resolveFontkit(namespace);

import * as namespace from '@pdf-lib/fontkit';

export type FontkitFont = namespace.Font;

// The package's ES build (what browser bundlers pick) only has a default export holding the
// fontkit object; its CommonJS build exposes the same members as named exports. Read both.
const resolved = namespace as typeof namespace & { default?: typeof namespace };
export const fontkit: typeof namespace = resolved.default ?? namespace;

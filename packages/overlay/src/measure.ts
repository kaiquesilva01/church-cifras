import type { Measure } from '@cifras/chords';
import { FONT_FILES, chooseFont } from './fonts';
import { fontkit, type FontkitFont } from './fontkit';
import type { FontBytesLoader, FontId } from './fonts';

export type LoadedFonts = Map<FontId, FontkitFont>;

const BOLD_FONT = /bold|black|heavy/i;

export async function loadFonts(
  loadFont: FontBytesLoader,
  ids: FontId[] = Object.keys(FONT_FILES) as FontId[],
): Promise<LoadedFonts> {
  const fonts: LoadedFonts = new Map();
  await Promise.all(
    ids.map(async (id) => {
      fonts.set(id, fontkit.create(await loadFont(id)));
    }),
  );
  return fonts;
}

// Same arithmetic as pdf-lib's embedded font (sum of glyph advances from layout), so the
// measure, the preview and the written PDF agree.
// Tolerant: a font that was not loaded (callers load only what they draw) is estimated at 0.6 em per
// character, like a monospace face, and reported once through `onWarn`.
const FALLBACK_ADVANCE_EM = 0.6;

export function createMeasure(fonts: LoadedFonts, onWarn?: (message: string) => void): Measure {
  const warned = new Set<FontId>();
  return (text, fontName, fontSize) => {
    const id = chooseFont(fontName, BOLD_FONT.test(fontName));
    const font = fonts.get(id);
    if (!font) {
      if (!warned.has(id)) {
        warned.add(id);
        onWarn?.(`Fonte não carregada: ${id}; largura estimada.`);
      }
      return text.length * FALLBACK_ADVANCE_EM * fontSize;
    }
    const { glyphs } = font.layout(text);
    let units = 0;
    for (const glyph of glyphs) units += glyph.advanceWidth;
    return (units / font.unitsPerEm) * fontSize;
  };
}

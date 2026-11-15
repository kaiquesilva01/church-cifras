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
export function createMeasure(fonts: LoadedFonts): Measure {
  return (text, fontName, fontSize) => {
    const id = chooseFont(fontName, BOLD_FONT.test(fontName));
    const font = fonts.get(id);
    if (!font) throw new Error(`Fonte não carregada: ${id}`);
    const { glyphs } = font.layout(text);
    let units = 0;
    for (const glyph of glyphs) units += glyph.advanceWidth;
    return (units / font.unitsPerEm) * fontSize;
  };
}

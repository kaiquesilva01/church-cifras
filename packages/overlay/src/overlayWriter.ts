import { PDFDocument, rgb } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import type { TransposePlan } from '@cifras/chords';
import type { FontBytesLoader, FontId } from './fonts';
import { fontkit } from './fontkit';
import { overlayOps } from './ops';

export interface ChordWriter {
  write(pdfBytes: Uint8Array, plan: TransposePlan): Promise<Uint8Array>;
}

const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);

export function createOverlayWriter(loadFont: FontBytesLoader): ChordWriter {
  return {
    async write(pdfBytes, plan) {
      const doc = await PDFDocument.load(pdfBytes);
      doc.registerFontkit(fontkit);
      const ops = overlayOps(plan);
      const embedded = new Map<FontId, PDFFont>();
      // Not subset: fontkit's subsetter emits broken outlines for several glyphs (D, F, #, ...) in
      // these fonts, leaving them blank. Full programs cost ~100-350 KB per font actually used.
      for (const id of new Set(ops.map((op) => op.text.fontId))) {
        embedded.set(id, await doc.embedFont(await loadFont(id), { subset: false }));
      }
      const pages = doc.getPages();
      for (const op of ops) {
        const page = pages[op.page - 1];
        if (!page) throw new Error(`Página ${op.page} não existe no PDF.`);
        page.drawRectangle({ ...op.rect, color: WHITE, borderWidth: 0 });
        page.drawText(op.text.value, {
          x: op.text.x,
          y: op.text.y,
          size: op.text.fontSize,
          font: embedded.get(op.text.fontId)!,
          color: BLACK,
        });
      }
      return doc.save();
    },
  };
}

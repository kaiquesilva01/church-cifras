import type { FontId } from '@cifras/overlay';
import { loadFontBytes } from './loadFonts';

export const fontFamily = (id: FontId): string => `cifras-${id}`;

const registered = new Map<FontId, Promise<void>>();

async function register(id: FontId): Promise<void> {
  const bytes = await loadFontBytes(id);
  const face = new FontFace(fontFamily(id), bytes.slice().buffer);
  await face.load();
  document.fonts.add(face);
}

// Registers only the fonts the ops use, once each; a failure is retried on the next call.
export function ensurePreviewFonts(ids: Iterable<FontId>): Promise<void> {
  const pending: Promise<void>[] = [];
  for (const id of new Set(ids)) {
    let promise = registered.get(id);
    if (!promise) {
      const created = register(id);
      promise = created;
      registered.set(id, created);
      created.catch(() => {
        if (registered.get(id) === created) registered.delete(id);
      });
    }
    pending.push(promise);
  }
  return Promise.all(pending).then(() => undefined);
}

import type { FontId } from '@cifras/overlay';

// One dynamic import per font: Vite emits each TTF as an asset and nothing lands in the main bundle.
const FONT_URLS: Record<FontId, () => Promise<{ default: string }>> = {
  'mono-bold': () => import('@cifras/overlay/fonts/LiberationMono-Bold.ttf?url'),
  'mono-regular': () => import('@cifras/overlay/fonts/LiberationMono-Regular.ttf?url'),
  'sans-bold': () => import('@cifras/overlay/fonts/LiberationSans-Bold.ttf?url'),
  'sans-regular': () => import('@cifras/overlay/fonts/LiberationSans-Regular.ttf?url'),
  'roboto-bold': () => import('@cifras/overlay/fonts/Roboto-Bold.ttf?url'),
  'roboto-regular': () => import('@cifras/overlay/fonts/Roboto-Regular.ttf?url'),
  'robotomono-bold': () => import('@cifras/overlay/fonts/RobotoMono-Bold.ttf?url'),
  'robotomono-regular': () => import('@cifras/overlay/fonts/RobotoMono-Regular.ttf?url'),
};

const cache = new Map<FontId, Promise<Uint8Array>>();

async function download(id: FontId): Promise<Uint8Array> {
  const { default: url } = await FONT_URLS[id]();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Não foi possível carregar a fonte ${id}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function loadFontBytes(id: FontId): Promise<Uint8Array> {
  let promise = cache.get(id);
  if (!promise) {
    promise = download(id);
    cache.set(id, promise);
    // A failed download must not stick: the next call tries again.
    const current = promise;
    current.catch(() => {
      if (cache.get(id) === current) cache.delete(id);
    });
  }
  return promise;
}

export function resetFontCache(): void {
  cache.clear();
}

import type { Plugin } from 'vite';

interface BundleItem {
  type: 'chunk' | 'asset';
  name?: string;
  fileName: string;
  imports?: string[];
  isEntry?: boolean;
}

function closure(bundle: Record<string, BundleItem>, roots: string[]): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const dep of bundle[file]?.imports ?? []) visit(dep);
  };
  roots.forEach(visit);
  return seen;
}

// Files of the named chunks plus their static imports, minus whatever the entry already pulls in
// (Vite emits those preloads itself).
export function pickPreloadFiles(bundle: Record<string, BundleItem>, names: string[]): string[] {
  const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
  const entry = closure(
    bundle,
    chunks.filter((c) => c.isEntry).map((c) => c.fileName),
  );
  const wanted = closure(
    bundle,
    chunks.filter((c) => c.name !== undefined && names.includes(c.name)).map((c) => c.fileName),
  );
  return [...wanted].filter((file) => !entry.has(file));
}

// The app shell is the entry plus `bootstrap` and `firebase-core`, loaded by a dynamic import: without
// hints the browser would discover them only after running the entry (an extra round trip).
export function preloadHints(names: string[]): Plugin {
  let base = '/';
  return {
    name: 'cifras:preload-hints',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return [];
        return pickPreloadFiles(ctx.bundle as never, names).map((file) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: true, href: `${base}${file}` },
          injectTo: 'head' as const,
        }));
      },
    },
  };
}

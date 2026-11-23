import type { Plugin } from 'vite';

interface BundleItem {
  type: 'chunk' | 'asset';
  name?: string;
  fileName: string;
  imports?: string[];
  dynamicImports?: string[];
}

// Chunks that import, statically, a chunk named `name`. Dynamic imports don't count: they are lazy by design.
export function staticImporters(bundle: Record<string, BundleItem>, name: string): string[] {
  const items = Object.values(bundle).filter((item) => item.type === 'chunk');
  const targets = new Set(items.filter((c) => c.name === name).map((c) => c.fileName));
  return items
    .filter((c) => (c.imports ?? []).some((file) => targets.has(file)))
    .map((c) => c.fileName);
}

// Guard for chunks that must stay out of the app shell (and out of the precache): fails the build if one of
// them is pulled in by a static import, which would make the shell depend on a file the precache skips.
export function lazyChunks(names: string[]): Plugin {
  return {
    name: 'cifras:lazy-chunks',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const name of names) {
        const importers = staticImporters(bundle as never, name);
        if (importers.length > 0) {
          this.error(
            `O chunk "${name}" tem que ser carregado por import dinâmico, mas é importado estaticamente por: ${importers.join(', ')}.`,
          );
        }
      }
    },
  };
}

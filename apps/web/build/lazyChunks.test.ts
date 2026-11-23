import { describe, expect, it, vi } from 'vitest';
import { lazyChunks, staticImporters } from './lazyChunks';

const chunk = (
  name: string,
  fileName: string,
  imports: string[] = [],
  dynamicImports: string[] = [],
) => [fileName, { type: 'chunk', name, fileName, imports, dynamicImports }] as const;

describe('staticImporters', () => {
  it('lists the chunks that statically import the named chunk', () => {
    const bundle = Object.fromEntries([
      chunk('firebase-core', 'assets/firebase-core-x.js', ['assets/messaging-m.js']),
      chunk('messaging', 'assets/messaging-m.js'),
    ]);

    expect(staticImporters(bundle as never, 'messaging')).toEqual(['assets/firebase-core-x.js']);
  });

  it('ignores chunks that only load the named chunk dynamically', () => {
    const bundle = Object.fromEntries([
      chunk('index', 'assets/index-a.js', [], ['assets/messaging-m.js']),
      chunk('messaging', 'assets/messaging-m.js'),
    ]);

    expect(staticImporters(bundle as never, 'messaging')).toEqual([]);
  });
});

describe('lazyChunks plugin', () => {
  const bundleWithStaticImport = Object.fromEntries([
    chunk('firebase-core', 'assets/firebase-core-x.js', ['assets/messaging-m.js']),
    chunk('messaging', 'assets/messaging-m.js'),
  ]);

  // The hook is typed as a plain function here: the test calls it with a fake `this.error`.
  const runGenerateBundle = (
    plugin: ReturnType<typeof lazyChunks>,
    ctx: { error: (message: string) => void },
    bundle: unknown,
  ) => {
    const hook = plugin.generateBundle as unknown as (
      this: typeof ctx,
      options: unknown,
      bundle: unknown,
    ) => void;
    hook.call(ctx, {}, bundle);
  };

  it('fails the build naming the importers when a listed chunk is imported statically', () => {
    const error = vi.fn();

    runGenerateBundle(lazyChunks(['messaging']), { error }, bundleWithStaticImport);

    expect(error).toHaveBeenCalledTimes(1);
    const message = String(error.mock.calls[0]?.[0]);
    expect(message).toContain('messaging');
    expect(message).toContain('assets/firebase-core-x.js');
    expect(message).toMatch(/import dinâmico/);
  });

  it('passes when the listed chunks are only loaded dynamically', () => {
    const error = vi.fn();
    const bundle = Object.fromEntries([
      chunk('index', 'assets/index-a.js', [], ['assets/messaging-m.js']),
      chunk('messaging', 'assets/messaging-m.js'),
    ]);

    runGenerateBundle(lazyChunks(['messaging']), { error }, bundle);

    expect(error).not.toHaveBeenCalled();
  });

  it('only applies to builds', () => {
    expect(lazyChunks(['messaging']).apply).toBe('build');
  });
});

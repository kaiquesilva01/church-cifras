import { describe, expect, it } from 'vitest';
import { pickPreloadFiles } from './preloadHints';

const chunk = (name: string, fileName: string, imports: string[] = [], isEntry = false) =>
  [fileName, { type: 'chunk', name, fileName, imports, isEntry }] as const;

describe('pickPreloadFiles', () => {
  const bundle = Object.fromEntries([
    chunk('index', 'assets/index-a.js', ['assets/runtime-r.js'], true),
    chunk('runtime', 'assets/runtime-r.js'),
    chunk('bootstrap', 'assets/bootstrap-b.js', [
      'assets/runtime-r.js',
      'assets/hooks-h.js',
      'assets/firebase-core-f.js',
    ]),
    chunk('hooks', 'assets/hooks-h.js', ['assets/runtime-r.js']),
    chunk('firebase-core', 'assets/firebase-core-f.js', ['assets/runtime-r.js']),
    chunk('pdfjs', 'assets/pdfjs-p.js'),
    ['assets/style.css', { type: 'asset', fileName: 'assets/style.css' }],
  ]);

  it('returns the named chunks and their static imports, without what the entry already loads', () => {
    expect(pickPreloadFiles(bundle as never, ['bootstrap', 'firebase-core']).sort()).toEqual([
      'assets/bootstrap-b.js',
      'assets/firebase-core-f.js',
      'assets/hooks-h.js',
    ]);
  });

  it('ignores names that are not in the bundle', () => {
    expect(pickPreloadFiles(bundle as never, ['nope'])).toEqual([]);
  });
});

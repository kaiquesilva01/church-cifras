import { describe, expect, it, vi } from 'vitest';
import { prefetchForPath } from './prefetch';

describe('prefetchForPath', () => {
  it('prefetches the viewer chunks when the initial route is a song', () => {
    const loadViewer = vi.fn(() => Promise.resolve());
    prefetchForPath('/musicas/abc123', loadViewer);
    expect(loadViewer).toHaveBeenCalledTimes(1);
  });

  it.each(['/', '/login', '/cantores/x', '/nova', '/musicas', '/musicas/'])(
    'does nothing for %s',
    (path) => {
      const loadViewer = vi.fn(() => Promise.resolve());
      prefetchForPath(path, loadViewer);
      expect(loadViewer).not.toHaveBeenCalled();
    },
  );

  it('swallows a failed prefetch (React.lazy retries and reports it later)', async () => {
    const loadViewer = vi.fn(() => Promise.reject(new Error('offline')));
    expect(() => prefetchForPath('/musicas/abc', loadViewer)).not.toThrow();
    await Promise.resolve();
  });
});

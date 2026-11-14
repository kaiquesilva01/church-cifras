import { FONT_FILES, type FontId } from '@cifras/overlay';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadFontBytes, resetFontCache } from './loadFonts';

afterEach(() => {
  vi.unstubAllGlobals();
  resetFontCache();
});

const okResponse = (bytes: number[]) => ({
  ok: true,
  arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer),
});

describe('loadFontBytes', () => {
  it('fetches the font file and caches the promise', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<unknown>>(() =>
      Promise.resolve(okResponse([7, 8])),
    );
    vi.stubGlobal('fetch', fetchMock);
    const first = loadFontBytes('mono-bold');
    expect(loadFontBytes('mono-bold')).toBe(first);
    await expect(first).resolves.toEqual(new Uint8Array([7, 8]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toContain(FONT_FILES['mono-bold']);
  });

  it('knows a file for every font id', async () => {
    const fetchMock = vi.fn<(url: string) => Promise<unknown>>(() =>
      Promise.resolve(okResponse([1])),
    );
    vi.stubGlobal('fetch', fetchMock);
    const ids = Object.keys(FONT_FILES) as FontId[];
    await Promise.all(ids.map((id) => loadFontBytes(id)));
    const urls = fetchMock.mock.calls.map((call) => call[0]);
    for (const id of ids) {
      expect(urls.filter((u) => u.endsWith(FONT_FILES[id]))).toHaveLength(1);
    }
  });

  it('rejects and does not cache a failed download', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce(okResponse([1]));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadFontBytes('sans-bold')).rejects.toThrow();
    await expect(loadFontBytes('sans-bold')).resolves.toBeInstanceOf(Uint8Array);
  });

  it('a stale failure does not evict a newer cache entry', async () => {
    let rejectFirst: (r: unknown) => void = () => undefined;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(new Promise((_resolve, reject) => (rejectFirst = reject)))
      .mockResolvedValue(okResponse([1]));
    vi.stubGlobal('fetch', fetchMock);
    const first = loadFontBytes('mono-bold');
    const firstSettled = first.catch(() => undefined);
    // let the first download reach fetch before the cache is reset
    await new Promise((resolve) => setTimeout(resolve, 0));
    resetFontCache();
    const second = loadFontBytes('mono-bold');
    rejectFirst(new Error('late failure'));
    await firstSettled;
    await second;
    expect(loadFontBytes('mono-bold')).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  createPwaOptions,
  isFontRequest,
  isPdfObjectRequest,
  isPadObjectRequest,
  rejectHtmlResponse,
  pwaOptions,
  cacheEmulatorStorage,
} from './pwaConfig';

const publicDir = resolve(import.meta.dirname, '../public');

describe('pwa manifest', () => {
  const manifest = pwaOptions.manifest as {
    icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
  } & Record<string, unknown>;

  it('declares name, colors, display and language', () => {
    expect(manifest).toMatchObject({
      name: 'Cifras · Louvor',
      short_name: 'Cifras',
      theme_color: '#f4f5f7',
      background_color: '#f4f5f7',
      display: 'standalone',
      lang: 'pt-BR',
      start_url: '/',
      scope: '/',
    });
  });

  it('lists 192, 512 and maskable icons that exist with the right size', async () => {
    const summary = manifest.icons.map((i) => `${i.sizes}|${i.purpose ?? 'any'}`).sort();
    expect(summary).toEqual(['192x192|any', '512x512|any', '512x512|maskable']);
    for (const icon of manifest.icons) {
      const file = resolve(publicDir, icon.src.replace(/^\//, ''));
      expect(existsSync(file), icon.src).toBe(true);
      const meta = await sharp(file).metadata();
      expect(`${meta.width}x${meta.height}`).toBe(icon.sizes);
      expect(meta.format).toBe('png');
    }
  });
});

describe('pwa options', () => {
  it('asks the user before updating', () => {
    expect(pwaOptions.registerType).toBe('prompt');
  });

  it('precaches only the app shell', () => {
    const workbox = pwaOptions.workbox!;
    expect(workbox.navigateFallback).toBe('/index.html');
    expect(workbox.navigateFallbackDenylist?.some((r) => r.test('/__/auth/handler'))).toBe(true);
    expect(workbox.globPatterns!.join(' ')).not.toMatch(/ttf|pdf/);
    expect(workbox.globIgnores).toEqual(
      expect.arrayContaining([
        '**/assets/pdfjs-*',
        '**/assets/overlay-*',
        '**/assets/UploadRoute-*',
        '**/assets/ImportRoute-*',
        '**/assets/ViewerRoute-*',
      ]),
    );
  });
});

describe('runtime request matchers', () => {
  const url = (value: string) => new URL(value);
  const object = 'https://firebasestorage.googleapis.com/v0/b/bucket/o/songs%2Fs1%2FG-abc.pdf';

  it('matches only GET downloads of song objects from Storage', () => {
    expect(isPdfObjectRequest(url(`${object}?alt=media&token=x`), 'GET')).toBe(true);
    expect(isPdfObjectRequest(url(`${object}?token=x&alt=media`), 'GET')).toBe(true);
    expect(isPdfObjectRequest(url(object), 'POST')).toBe(false);
    expect(isPdfObjectRequest(url(object), 'DELETE')).toBe(false);
    expect(
      isPdfObjectRequest(
        url('https://firebasestorage.googleapis.com/v0/b/bucket/o/avatars%2Fa.png?alt=media'),
        'GET',
      ),
    ).toBe(false);
    expect(
      isPdfObjectRequest(
        url('https://firebasestorage.googleapis.com/v0/b/bucket/o?prefix=songs'),
        'GET',
      ),
    ).toBe(false);
  });

  it('requires alt=media: metadata and token-only requests are not cached', () => {
    expect(isPdfObjectRequest(url(object), 'GET')).toBe(false);
    expect(isPdfObjectRequest(url(`${object}?token=x`), 'GET')).toBe(false);
    expect(isPdfObjectRequest(url(`${object}?alt=json`), 'GET')).toBe(false);
    expect(isPdfObjectRequest(url(`${object}?xalt=media`), 'GET')).toBe(false);
    expect(isPdfObjectRequest(url(`${object}?alt=mediax`), 'GET')).toBe(false);
  });

  it('matches the Storage emulator only when built for emulators', () => {
    const emulator = url('http://localhost:9199/v0/b/b/o/songs%2Fs1%2FG-abc.pdf?alt=media');
    expect(isPdfObjectRequest(emulator, 'GET')).toBe(false);
    expect(isPdfObjectRequest(emulator, 'GET', true)).toBe(true);
    expect(
      isPdfObjectRequest(url('http://localhost:9199/v0/b/b/o/songs%2Fs1%2FG.pdf'), 'GET', true),
    ).toBe(false);
    const patterns = (options: typeof pwaOptions) =>
      options.workbox!.runtimeCaching!.map((r) => String(r.urlPattern));
    expect(patterns(pwaOptions).join(' ')).not.toContain('9199');
    expect(patterns(createPwaOptions(true)).join(' ')).toContain('9199');
  });

  it('includes the emulator host outside production or with VITE_USE_EMULATORS', () => {
    expect(cacheEmulatorStorage('production', {})).toBe(false);
    expect(cacheEmulatorStorage('production', { VITE_USE_EMULATORS: 'false' })).toBe(false);
    expect(cacheEmulatorStorage('production', { VITE_USE_EMULATORS: 'true' })).toBe(true);
    expect(cacheEmulatorStorage('development', {})).toBe(true);
  });

  it('never matches Firestore, Functions or Auth hosts', () => {
    for (const host of [
      'https://firestore.googleapis.com/v1/projects/p/databases/(default)/documents/songs%2Fs1',
      'https://us-central1-p.cloudfunctions.net/transposeSong',
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup',
      'https://securetoken.googleapis.com/v1/token',
    ]) {
      expect(isPdfObjectRequest(url(host), 'GET'), host).toBe(false);
    }
  });

  it('matches font files', () => {
    expect(isFontRequest(url('https://app.test/assets/NotoSans-abc123.ttf'))).toBe(true);
    expect(isFontRequest(url('https://app.test/assets/index-abc.js'))).toBe(false);
  });
});

describe('emulator host', () => {
  const object = (host: string) =>
    new URL(`http://${host}:9199/v0/b/b/o/songs%2Fs1%2FG.pdf?alt=media`);

  it('matches the configured emulator host, escaped, and not others', () => {
    expect(isPdfObjectRequest(object('storage.local'), 'GET', true, 'storage.local')).toBe(true);
    expect(isPdfObjectRequest(object('storageXlocal'), 'GET', true, 'storage.local')).toBe(false);
    expect(isPdfObjectRequest(object('localhost'), 'GET', true, 'storage.local')).toBe(false);
    expect(isPdfObjectRequest(object('localhost'), 'GET', true)).toBe(true);
  });

  it('passes the host into the runtime caching rule', () => {
    const patterns = createPwaOptions(true, 'storage.local')
      .workbox!.runtimeCaching!.map((r) => String(r.urlPattern))
      .join(' ');
    expect(patterns).toContain('storage\\.local:9199');
  });
});

describe('pad runtime caching', () => {
  const url = (value: string) => new URL(value);
  const pad = 'https://firebasestorage.googleapis.com/v0/b/b1/o/pads%2Fv1%2FDS04-C.m4a';
  const song = 'https://firebasestorage.googleapis.com/v0/b/b1/o/songs%2FDS04-C.m4a';

  it('matches only GET media downloads of pad objects from Storage', () => {
    expect(isPadObjectRequest(url(`${pad}?alt=media&token=t`), 'GET')).toBe(true);
    expect(isPadObjectRequest(url(`${song}?alt=media&token=t`), 'GET')).toBe(false);
    expect(isPadObjectRequest(url(pad), 'GET')).toBe(false);
    expect(isPadObjectRequest(url(`${pad}?alt=media`), 'POST')).toBe(false);
    expect(
      isPadObjectRequest(
        url('https://example.com/v0/b/b1/o/pads%2Fv1%2FDS04-C.m4a?alt=media'),
        'GET',
      ),
    ).toBe(false);
  });

  it('keeps the PDF and pad matchers disjoint', () => {
    expect(isPdfObjectRequest(url(`${pad}?alt=media`), 'GET')).toBe(false);
  });

  it('matches the Storage emulator only when built for emulators', () => {
    const emulator = url('http://localhost:9199/v0/b/b1/o/pads%2Fv1%2FDS04-C.m4a?alt=media');
    expect(isPadObjectRequest(emulator, 'GET')).toBe(false);
    expect(isPadObjectRequest(emulator, 'GET', true)).toBe(true);
  });

  it('registers a CacheFirst rule for pads', () => {
    const rule = createPwaOptions(false).workbox!.runtimeCaching!.find(
      (r) => r.options?.cacheName === 'cifras-pads',
    )!;
    expect(rule.handler).toBe('CacheFirst');
    expect(rule.options!.cacheableResponse!.statuses).toEqual([200]);
  });
});

describe('chunk runtime caching', () => {
  const chunks = () =>
    pwaOptions.workbox!.runtimeCaching!.find((r) =>
      (r.urlPattern as RegExp).test('https://app.test/assets/x-1.js'),
    )!;

  it('caches only status 200 and refuses HTML served under a chunk URL', async () => {
    const options = chunks().options!;
    expect(options.cacheableResponse).toEqual({ statuses: [200] });
    expect(options.plugins).toHaveLength(1);
    const html = new Response('<!doctype html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
    const js = new Response('export{}', { headers: { 'content-type': 'text/javascript' } });
    await expect(rejectHtmlResponse({ response: html })).resolves.toBeNull();
    await expect(rejectHtmlResponse({ response: js })).resolves.toBe(js);
    await expect(
      options.plugins![0]!.cacheWillUpdate!({ response: html } as never),
    ).resolves.toBeNull();
  });
});

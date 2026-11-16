import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const config = JSON.parse(readFileSync(resolve(root, 'firebase.json'), 'utf8'));

describe('firebase.json', () => {
  it('binds every emulator to 0.0.0.0', () => {
    const { emulators } = config;
    for (const name of ['auth', 'firestore', 'storage', 'functions', 'ui', 'hub', 'logging']) {
      expect(emulators[name].host, name).toBe('0.0.0.0');
    }
  });

  it('uses the agreed ports', () => {
    const { emulators } = config;
    expect(emulators.auth.port).toBe(9099);
    expect(emulators.firestore.port).toBe(8080);
    expect(emulators.firestore.websocketPort).toBe(9150);
    expect(emulators.storage.port).toBe(9199);
    expect(emulators.functions.port).toBe(5001);
    expect(emulators.ui.port).toBe(4000);
    expect(emulators.hub.port).toBe(4400);
    expect(emulators.logging.port).toBe(4500);
    expect(emulators.ui.enabled).toBe(true);
    expect(emulators.singleProjectMode).toBe(true);
  });

  it('functions run on nodejs22 from apps/functions', () => {
    expect(config.functions.source).toBe('apps/functions');
    expect(config.functions.runtime).toBe('nodejs22');
    expect(config.functions.predeploy).toEqual(['npm run build -w @cifras/functions']);
  });

  it('hosting serves apps/web/dist as SPA', () => {
    expect(config.hosting.public).toBe('apps/web/dist');
    expect(config.hosting.rewrites).toHaveLength(1);
  });

  it('rewrites app routes to index.html but never missing assets', () => {
    const rewrite = (config.hosting.rewrites as Array<{ regex: string; destination: string }>)[0]!;
    expect(rewrite.destination).toBe('/index.html');
    // Firebase regex rewrites use RE2 (no lookahead): only extensionless paths are app routes, so a
    // missing /assets/*.js (or any other file) gets a real 404 instead of HTML with status 200.
    expect(rewrite.regex).not.toContain('(?');
    const re = new RegExp(rewrite.regex);
    for (const route of ['/', '/songs/s1', '/import', '/pessoas']) {
      expect(re.test(route), route).toBe(true);
    }
    for (const asset of ['/assets/index-gone.js', '/assets/x/y.css', '/sw.js']) {
      expect(re.test(asset), asset).toBe(false);
    }
  });

  it('firebase.json serves sw and index without cache', () => {
    const headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> =
      config.hosting.headers;
    // Firebase applies every matching header; the last Cache-Control wins.
    const cacheControl = (path: string) =>
      headers
        .filter(
          (h) =>
            h.source === '**' ||
            h.source === path ||
            (h.source === '/assets/**' && path.startsWith('/assets/')),
        )
        .flatMap((h) => h.headers)
        .filter((h) => h.key === 'Cache-Control')
        .at(-1)?.value;
    for (const path of ['/sw.js', '/index.html', '/manifest.webmanifest']) {
      expect(cacheControl(path), path).toBe('no-cache');
    }
    expect(cacheControl('/assets/index-abc.js')).toBe('public, max-age=31536000, immutable');
    expect(headers.some((h) => h.source === '/sw.js')).toBe(true);
    expect(headers.some((h) => h.source === '/index.html')).toBe(true);
  });

  it('serves index with no-cache and assets immutable', () => {
    // Firebase applies every matching header; later entries override earlier ones.
    const headers = config.hosting.headers;
    const all = headers.findIndex((h: { source: string }) => h.source === '**');
    const assets = headers.findIndex((h: { source: string }) => h.source === '/assets/**');
    expect(all).toBeGreaterThanOrEqual(0);
    expect(headers[all].headers).toEqual([{ key: 'Cache-Control', value: 'no-cache' }]);
    expect(assets).toBeGreaterThan(all);
    expect(headers[assets].headers).toEqual([
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ]);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const config = JSON.parse(readFileSync(resolve(root, 'firebase.json'), 'utf8'));

const APP_SITE = 'louvor-hajaluz';
const LEGACY_SITE = 'cifras-louvor-5dd50';
const TEST_SITE = 'louvor-hajaluz-teste';
type Site = {
  site: string;
  rewrites?: unknown[];
  redirects?: unknown[];
  public?: string;
  ignore?: string[];
  headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
};
const sites: Site[] = config.hosting;
// The app is served from the friendly site; the project's default site only redirects to it.
const app = sites.find((s) => s.site === APP_SITE)!;
const legacy = sites.find((s) => s.site === LEGACY_SITE)!;

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

  it('hosting has exactly the friendly app site, the legacy redirect site and the test site', () => {
    expect(sites.map((s) => s.site).sort()).toEqual([APP_SITE, LEGACY_SITE, TEST_SITE].sort());
  });

  it('the test site mirrors the app site public, ignore, rewrites and headers', () => {
    const test = sites.find((s) => s.site === TEST_SITE)!;
    expect(test.public).toBe(app.public);
    expect(test.ignore).toEqual(app.ignore);
    expect(test.rewrites).toEqual(app.rewrites);
    expect(test.headers).toEqual(app.headers);
  });

  it('hosting serves apps/web/dist as SPA on the friendly site', () => {
    expect(app.public).toBe('apps/web/dist');
    expect(app.rewrites).toHaveLength(1);
  });

  describe('legacy site', () => {
    type Redirect = { source?: string; regex?: string; destination: string; type: number };
    const redirects = (legacy.redirects ?? []) as Redirect[];
    // The root has its own rule: a regex capture that matches the empty string makes the destination
    // (`/:path`) fail to compile in Firebase/superstatic and the request falls through to a 404.
    const rootRule = redirects.find((r) => r.source === '/')!;
    const pathRule = redirects.find((r) => r.regex !== undefined)!;
    // Firebase regex redirects use RE2 with (?P<name>...); JS spells named groups (?<name>...).
    const re = new RegExp(pathRule.regex!.replace('(?P<', '(?<'));
    const target = (path: string) => {
      if (path === '/') return rootRule.destination;
      const m = re.exec(path);
      return m ? pathRule.destination.replace(':path', m.groups!.path!) : null;
    };

    it('has permanent redirects only and never rewrites', () => {
      expect(legacy.rewrites).toBeUndefined();
      expect(redirects).toHaveLength(2);
      expect(redirects.every((r) => r.type === 301)).toBe(true);
      // RE2 has no lookahead.
      expect(pathRule.regex).not.toContain('(?=');
      expect(pathRule.regex).not.toContain('(?!');
    });

    it('redirects the root with its own rule, before the path rule', () => {
      expect(redirects[0]).toBe(rootRule);
      expect(rootRule.destination).toBe(`https://${APP_SITE}.web.app/`);
      // The path capture can never be empty, so the root must not depend on it.
      expect(re.test('/')).toBe(false);
    });

    it('redirects every other path to the friendly site keeping the path', () => {
      const base = `https://${APP_SITE}.web.app`;
      expect(target('/')).toBe(`${base}/`);
      expect(target('/musicas/s1')).toBe(`${base}/musicas/s1`);
      expect(target('/cantores/joao-silva')).toBe(`${base}/cantores/joao-silva`);
      expect(target('/assets/index-abc.js')).toBe(`${base}/assets/index-abc.js`);
    });

    it('never redirects /sw.js, so old clients can fetch the self-unregistering worker', () => {
      expect(re.test('/sw.js')).toBe(false);
      expect(rootRule.source).toBe('/');
      // Prefixes and look-alikes still redirect.
      for (const path of [
        '/s',
        '/sw',
        '/sw.',
        '/sw.j',
        '/sw.json',
        '/sw.js/x',
        '/swXjs',
        '/sw.jsx',
      ]) {
        expect(re.test(path), path).toBe(true);
      }
    });

    it('serves /sw.js from a minimal public dir that unregisters the worker', () => {
      expect(legacy.public).toBe('hosting/legacy');
      const sw = readFileSync(resolve(root, 'hosting/legacy/sw.js'), 'utf8');
      expect(sw).toContain('registration.unregister()');
      expect(sw).toContain('caches.delete');
      expect(sw).toContain('client.navigate');
      const swHeaders = legacy.headers.filter((h) => h.source === '/sw.js');
      expect(swHeaders.flatMap((h) => h.headers)).toEqual([
        { key: 'Cache-Control', value: 'no-cache' },
      ]);
    });
  });

  it('rewrites app routes to index.html but never missing assets', () => {
    const rewrite = (app.rewrites as Array<{ regex: string; destination: string }>)[0]!;
    expect(rewrite.destination).toBe('/index.html');
    // Firebase regex rewrites use RE2 (no lookahead): only extensionless paths are app routes, so a
    // missing /assets/*.js (or any other file) gets a real 404 instead of HTML with status 200.
    expect(rewrite.regex).not.toContain('(?');
    const re = new RegExp(rewrite.regex);
    const routes = [
      '/',
      '/musicas/s1',
      '/cantores/joao-silva',
      '/importar',
      '/nova',
      '/pessoas',
      '/login',
    ];
    for (const route of routes) {
      expect(re.test(route), route).toBe(true);
    }
    for (const asset of ['/assets/index-gone.js', '/assets/x/y.css', '/sw.js']) {
      expect(re.test(asset), asset).toBe(false);
    }
  });

  it('firebase.json serves sw and index without cache', () => {
    const headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> =
      app.headers;
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
    const headers = app.headers;
    const all = headers.findIndex((h: { source: string }) => h.source === '**');
    const assets = headers.findIndex((h: { source: string }) => h.source === '/assets/**');
    expect(all).toBeGreaterThanOrEqual(0);
    expect(headers[all]?.headers).toEqual([{ key: 'Cache-Control', value: 'no-cache' }]);
    expect(assets).toBeGreaterThan(all);
    expect(headers[assets]?.headers).toEqual([
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ]);
  });
});

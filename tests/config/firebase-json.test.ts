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
    expect(config.hosting.rewrites).toContainEqual({ source: '**', destination: '/index.html' });
    expect(config.hosting.headers).toContainEqual({
      source: '/assets/**',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    });
  });
});

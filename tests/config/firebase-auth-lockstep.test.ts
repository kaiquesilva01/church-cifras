import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const webDir = resolve(root, 'apps/web');
// Resolve from apps/web so npm workspace hoisting is honoured.
const requireFromWeb = createRequire(resolve(webDir, 'package.json'));

describe('firebase auth lockstep', () => {
  it('apps/web pins the same @firebase/auth that the installed firebase depends on', () => {
    const web = JSON.parse(readFileSync(resolve(webDir, 'package.json'), 'utf8'));
    const firebase = JSON.parse(
      readFileSync(requireFromWeb.resolve('firebase/package.json'), 'utf8'),
    );
    const direct = web.dependencies?.['@firebase/auth'];
    const bundled = firebase.dependencies?.['@firebase/auth'];

    expect(
      direct,
      `apps/web declares @firebase/auth ${direct} but firebase ${firebase.version} depends on ` +
        `${bundled}. Bump @firebase/auth in apps/web/package.json together with firebase, ` +
        'otherwise npm installs two copies and the sign-in popup warm-up (prepareSignIn) ' +
        'warms a different instance than signInWithPopup uses.',
    ).toBe(bundled);
  });
});

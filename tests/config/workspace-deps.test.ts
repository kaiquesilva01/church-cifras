import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

describe('workspace packaging', () => {
  it('functions does not declare workspace packages as dependencies', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'apps/functions/package.json'), 'utf8'));
    const declared = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    expect(declared.filter((name) => name.startsWith('@cifras/'))).toEqual([]);
  });

  it('dev image copies the chords package manifest', () => {
    const dockerfile = readFileSync(resolve(root, 'docker/dev.Dockerfile'), 'utf8');
    expect(dockerfile).toContain('COPY packages/chords/package.json packages/chords/package.json');
  });

  it('dev image copies the pdf package manifest and compose isolates its node_modules', () => {
    const dockerfile = readFileSync(resolve(root, 'docker/dev.Dockerfile'), 'utf8');
    const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8');
    expect(dockerfile).toContain('COPY packages/pdf/package.json packages/pdf/package.json');
    expect(compose).toContain('/app/packages/pdf/node_modules');
  });

  it('dev image copies the overlay package manifest and compose isolates its node_modules', () => {
    const dockerfile = readFileSync(resolve(root, 'docker/dev.Dockerfile'), 'utf8');
    const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8');
    expect(dockerfile).toContain(
      'COPY packages/overlay/package.json packages/overlay/package.json',
    );
    expect(compose).toContain('/app/packages/overlay/node_modules');
  });

  // Cloud Build installs apps/functions/package.json alone (npm 10, no lockfile). With npm 10.9.x the pair
  // firebase-admin + firebase-functions crashes with "Cannot read properties of null (reading 'edgesOut')".
  // legacy-peer-deps avoids the peer-resolution path that crashes; the file must reach the upload.
  it('functions install config avoids the npm 10 peer-resolution crash on Cloud Build', () => {
    const npmrc = readFileSync(resolve(root, 'apps/functions/.npmrc'), 'utf8');
    const settings = npmrc
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#') && !line.startsWith(';'));
    expect(settings).toContain('legacy-peer-deps=true');
  });

  it('functions deploy does not ignore dotfiles, so .npmrc is uploaded with the source', () => {
    const config = JSON.parse(readFileSync(resolve(root, 'firebase.json'), 'utf8'));
    const ignore: string[] = config.functions.ignore ?? [];
    expect(
      ignore.filter((pattern) => pattern.includes('.*') || pattern.includes('.npmrc')),
    ).toEqual([]);
  });
});

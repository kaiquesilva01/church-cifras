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
});

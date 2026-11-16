import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_FILES } from '../src/fonts';

const pkgDir = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8'));

// Every module reachable from `entry` through relative imports, plus the bare specifiers it uses.
function graph(entry: string) {
  const files = new Set<string>();
  const bare = new Set<string>();
  const visit = (file: string): void => {
    if (files.has(file)) return;
    files.add(file);
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/^(?:import|export)\s(?!type\s)[^;]*?from\s+'([^']+)'/gm)) {
      const spec = match[1]!;
      if (spec.startsWith('.')) visit(resolve(dirname(file), `${spec}.ts`));
      else bare.add(spec);
    }
  };
  visit(entry);
  return { files, bare };
}

describe('package entries', () => {
  it('exposes a light ./ops entry and the font files', () => {
    expect(pkg.exports['./ops']).toBeDefined();
    // explicit entries: a `*` pattern would also expose fonts/source/* and fonts/LICENSES/*
    for (const file of Object.values(FONT_FILES)) {
      expect(pkg.exports[`./fonts/${file}`]).toBe(`./fonts/${file}`);
    }
    expect(Object.keys(pkg.exports).filter((k) => k.includes('*'))).toEqual([]);
    expect(pkg.exports['.']).toBeDefined();
  });

  it('keeps pdf-lib and fontkit out of the light entry', () => {
    const entry = resolve(pkgDir, pkg.exports['./ops'].default ?? pkg.exports['./ops']);
    const { files, bare } = graph(entry);
    expect([...bare].filter((s) => s === 'pdf-lib' || s.includes('fontkit'))).toEqual([]);
    expect([...files].map((f) => basename(f))).not.toContain('fontkit.ts');
  });

  it('light entry exports chooseFont, overlayOps, countCollisions and FONT_FILES', async () => {
    const light = await import('../src/light');
    expect(Object.keys(light).sort()).toEqual(
      ['FONT_FILES', 'chooseFont', 'countCollisions', 'overlayOps'].sort(),
    );
  });
});

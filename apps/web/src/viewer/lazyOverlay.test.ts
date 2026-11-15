import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

// pdf-lib and fontkit (~600 KB) must only load when a member opens "Mudar tom".
describe('initial bundle', () => {
  it('never statically imports the full @cifras/overlay entry', () => {
    const offenders = sources(root).filter((file) =>
      /^(?:import|export)\s(?!type\s)[^;]*?from\s+'@cifras\/overlay'/m.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });
});

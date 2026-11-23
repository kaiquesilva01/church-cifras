import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('redesign-access.css', () => {
  const css = readFileSync(resolve(import.meta.dirname, 'redesign-access.css'), 'utf8');
  it('uses tokens only, no hex or rgb colors', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rgba?\(/);
  });
  it('scopes every selector to the access- prefix', () => {
    const selectors = [...css.matchAll(/^([^{}/]+)\{/gm)].map((m) => m[1]!.trim());
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      for (const part of selector.split(',')) expect(part.trim()).toMatch(/^\.access-/);
    }
  });
  it('keeps the exit button at 54 px and at least 44 px tall', () => {
    expect(css).toMatch(/\.access-exit\s*{[^}]*min-height:\s*54px;/);
  });
});

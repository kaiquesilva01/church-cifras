import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('redesign-push.css', () => {
  const css = readFileSync(resolve(import.meta.dirname, 'redesign-push.css'), 'utf8');
  it('uses tokens only, no hex colors', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
  it('keeps the action pill at 44 px', () => {
    expect(css).toMatch(/\.push-action\s*{[^}]*min-height:\s*44px/);
  });
});

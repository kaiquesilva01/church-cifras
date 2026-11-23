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
  it('dims the disabled action pill to 0.6 opacity', () => {
    expect(css).toMatch(/\.push-action:disabled\s*{[^}]*opacity:\s*0\.6;/);
  });
  it('indents the test button under the row text (70 px left padding)', () => {
    expect(css).toMatch(/\.push-test\s*{[^}]*padding:\s*0 16px 12px 70px;/);
  });
  it('styles error alerts with the error tokens and 14 px radius', () => {
    expect(css).toMatch(
      /\.push-alert\s*{[^}]*border:\s*1px solid var\(--color-error\);[^}]*border-radius:\s*14px;[^}]*background:\s*var\(--color-error-soft\);[^}]*color:\s*var\(--color-error\);/,
    );
  });
  it('gives the success notice inside the status region its own margin', () => {
    expect(css).toMatch(/\.push-status \.notice\s*{[^}]*margin:\s*0 16px 12px;/);
  });
});

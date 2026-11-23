import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_COLORS, THEME_KEY } from '../lib/theme';

const css = readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8');
const redesignCss =
  readFileSync(resolve(import.meta.dirname, 'redesign.css'), 'utf8') +
  readFileSync(resolve(import.meta.dirname, 'redesign-cifra.css'), 'utf8') +
  readFileSync(resolve(import.meta.dirname, 'redesign-setlists.css'), 'utf8') +
  readFileSync(resolve(import.meta.dirname, 'redesign-forms.css'), 'utf8') +
  readFileSync(resolve(import.meta.dirname, 'redesign-states.css'), 'utf8') +
  readFileSync(resolve(import.meta.dirname, 'redesign-stats.css'), 'utf8') +
  readFileSync(resolve(import.meta.dirname, 'redesign-install.css'), 'utf8') +
  readFileSync(resolve(import.meta.dirname, 'redesign-push.css'), 'utf8') +
  readFileSync(resolve(import.meta.dirname, 'redesign-access.css'), 'utf8');
const html = readFileSync(resolve(import.meta.dirname, '../../index.html'), 'utf8');

function tokens(block: string): string[] {
  return [...block.matchAll(/^\s*(--color-[a-z-]+|--shadow-[a-z-]+):/gm)].map((m) => m[1]!).sort();
}

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf('\n}', start));
}

describe('theme tokens', () => {
  it('defines the same color tokens in the light and the dark theme', () => {
    const light = tokens(block(':root'));
    const dark = tokens(block(":root[data-theme='dark']"));
    expect(light.length).toBeGreaterThan(15);
    expect(dark).toEqual(light);
  });

  it('keeps the page background the same as the browser chrome color', () => {
    expect(block(':root')).toContain(`--color-bg: ${THEME_COLORS.light}`);
    expect(block(":root[data-theme='dark']")).toContain(`--color-bg: ${THEME_COLORS.dark}`);
  });

  it('has no hard-coded colors outside the token blocks', () => {
    const rest = css.slice(css.indexOf('\n* {')) + redesignCss;
    // Exceptions: the PDF paper (white in both themes), the WhatsApp brand green and neutral black shadows.
    const offenders = [...rest.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\((?!0 0 0 \/)/g)].map(
      (m) => m[0],
    );
    const allowed = new Set(['#ffffff', '#25d366']);
    expect(offenders.filter((color) => !allowed.has(color))).toEqual([]);
    expect(new Set(offenders)).toEqual(allowed);
  });

  it('paints the saved theme before the first frame, with the same storage key', () => {
    expect(html).toContain(`'${THEME_KEY}'`);
    expect(html).toContain('dataset.theme');
    // The script repeats the chrome colors by hand: they must match lib/theme.ts.
    expect(html).toContain(`'${THEME_COLORS.dark}'`);
    expect(html).toContain(`'${THEME_COLORS.light}'`);
    expect(html).toContain(`content="${THEME_COLORS.light}"`);
  });

  it('keeps the update prompt readable in both themes (no text-on-text colors)', () => {
    // Every .update-prompt rule that sets a background or color, in load order: the last one wins.
    const bodies = [...redesignCss.matchAll(/\n\.update-prompt \{([^}]*)\}/g)].map((m) => m[1]!);
    expect(bodies.length).toBeGreaterThan(0);
    const last = (property: string): string | undefined =>
      bodies
        .flatMap((body) => [...body.matchAll(new RegExp(`${property}: ([^;]+);`, 'g'))])
        .map((m) => m[1])
        .at(-1);
    expect(last('background')).toBe('var(--color-elevated)');
    expect(last('color')).toBe('var(--color-text)');
  });

  it('styles the install card with the shared shadow token and 44 px tap targets', () => {
    const install = readFileSync(resolve(import.meta.dirname, 'redesign-install.css'), 'utf8');
    expect(install).toMatch(/\.install-card \{[^}]*box-shadow: var\(--shadow-pop\);/);
    expect(install).toMatch(/\.install-card__close \{[^}]*width: 44px;[^}]*height: 44px;/);
    expect(install).toMatch(/\.install-card__add \{[^}]*min-height: 44px;/);
    expect(install).toMatch(/\.install-card__add span \{[^}]*height: 36px;/);
    expect(install).toMatch(/\.install-card__close span \{[^}]*width: 28px;[^}]*height: 28px;/);
  });
});

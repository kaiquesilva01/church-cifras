import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8');
const cifraCss = readFileSync(resolve(import.meta.dirname, 'redesign-cifra.css'), 'utf8');
const cifraRule = (selector: string): string => {
  const start = cifraCss.indexOf(`
${selector} {`);
  return start < 0 ? '' : cifraCss.slice(start, cifraCss.indexOf('}', start));
};
const rule = (selector: string): string => {
  const start = css.indexOf(`
${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
};

// jsdom has no layout, so the refit itself is covered in the browser; this guards the CSS that makes
// it possible: a grid track and a grid item that can shrink below the canvas width.
describe('viewer layout css', () => {
  it('lets the pdf column shrink so the side panel padding refits the page', () => {
    expect(rule('.viewer')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(rule('.pdf-pages')).toMatch(/min-width:\s*0/);
    expect(rule('.viewer.has-side')).toMatch(/padding-right:\s*336px/);
  });

  it('derives the bottom padding from the measured bar height, and the sheet still wins', () => {
    expect(rule('.viewer')).toMatch(
      /padding-bottom:\s*calc\(var\(--bar-height,\s*72px\)\s*\+\s*16px\)/,
    );
    expect(rule('.viewer.has-sheet')).toMatch(/padding-bottom:\s*calc\(var\(--sheet-height\)/);
    expect(css.indexOf('.viewer {')).toBeLessThan(css.indexOf('.viewer.has-sheet {'));
    // The measured height already includes the setlist row: no fixed constants are left.
    expect(css).not.toMatch(/\.viewer\.has-setlist \{/);
    expect(rule('.viewer')).not.toMatch(/padding-bottom:\s*\d+px/);
  });

  it('always wraps the bottom bar, since the pad control can overflow a phone', () => {
    expect(rule('.viewer-bar')).toMatch(/flex-wrap:\s*wrap/);
    expect(rule('.pad-control')).toMatch(/min-width:\s*0/);
  });

  it('gives the icon-only share button in the bar a 44px touch target', () => {
    expect(rule('.viewer-bar .btn-icon')).toMatch(/min-width:\s*44px/);
  });

  it('keeps the add-song focus ring inside the scrolling list', () => {
    expect(rule('.add-song-option:focus-visible')).toMatch(/outline-offset:\s*-2px/);
  });

  it('maximizes the pdf over the whole screen, above the bottom bar, scrolling by itself', () => {
    const maximized = cifraRule('.pdf-frame.is-fullscreen');
    expect(maximized).toMatch(/position:\s*fixed/);
    expect(maximized).toMatch(/inset:\s*0/);
    expect(maximized).toMatch(/overflow:\s*auto/);
    expect(Number(/z-index:\s*(\d+)/.exec(maximized)?.[1])).toBeGreaterThan(30);
    expect(cifraRule('.pdf-frame.is-fullscreen .pdf-expand')).toMatch(/position:\s*fixed/);
    expect(cifraRule('.pdf-expand')).toMatch(/position:\s*absolute/);
  });
});

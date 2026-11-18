import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, 'styles.css'), 'utf8');
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

  it('clears the taller bottom bar of a setlist, without overriding the sheet padding', () => {
    const px = (selector: string): number =>
      Number(/padding-bottom:\s*(\d+)px/.exec(rule(selector))?.[1] ?? 0);
    expect(px('.viewer.has-setlist')).toBeGreaterThan(px('.viewer'));
    expect(css.indexOf('.viewer.has-setlist {')).toBeLessThan(css.indexOf('.viewer.has-sheet {'));
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
});

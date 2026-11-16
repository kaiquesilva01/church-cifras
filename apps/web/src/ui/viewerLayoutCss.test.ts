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
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, 'redesign.css'), 'utf8');
const rule = (selector: string): string => {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
};

// jsdom has no layout: this guards the CSS the Paper screens 04 / 04c depend on.
describe('pad css', () => {
  it('keeps the status card the same size whether the pad is off or playing', () => {
    expect(rule('.pad-card')).toMatch(/height:\s*112px/);
    expect(rule('.pad-card')).toMatch(/flex-shrink:\s*0/);
  });

  it('outlines saved tones in the accent color and the Pad tab dot in success green', () => {
    expect(rule('.pad-tone.is-cached')).toMatch(/border-color:\s*var\(--color-accent\)/);
    expect(rule('.bottom-nav-dot')).toMatch(/background:\s*var\(--color-success\)/);
  });
});

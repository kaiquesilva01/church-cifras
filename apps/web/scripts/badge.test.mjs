import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { badgeSvg } from './badge.mjs';

const icon = readFileSync(resolve(import.meta.dirname, '../public/icons/icon.svg'), 'utf8');

describe('badgeSvg', () => {
  const badge = badgeSvg(icon);

  it('drops the background and every dark-colored shape', () => {
    expect(badge).not.toContain('rx="112"');
    expect(badge).not.toContain('#0A0B0D');
    expect(badge).not.toContain('#F5A623');
  });

  it('paints the flame white on its own element (a group fill would lose to explicit fills)', () => {
    expect(badge).toMatch(/<path d="[^"]+" fill="#ffffff" \/>/);
  });

  it('keeps the two notch shapes as holes through a mask, not as paint', () => {
    expect(badge).toMatch(/<mask id="furos"[^>]*>/);
    expect(badge).toContain('<ellipse');
    expect(badge).toContain('mask="url(#furos)"');
  });

  it('rasterizes transparent holes and an opaque flame (alpha check)', async () => {
    const { data, info } = await sharp(Buffer.from(badge))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];
    expect(alpha(235, 340)).toBe(0); // centro do furo da cabeça da nota
    expect(alpha(306, 264)).toBe(255); // dentro da chama
    expect(alpha(0, 0)).toBe(0); // canto: sem fundo
  });

  it('rejects an icon without the expected shapes', () => {
    expect(() => badgeSvg('<svg></svg>')).toThrow(/badge/);
  });
});

import type { Page } from '@playwright/test';
import { expect, expectPdfRendered, shot, signInAs, ADMIN, test } from './fixtures/app';
import { seedSong } from './fixtures/emulator';
import { lettersTag } from './fixtures/names';

const WIDTH = 360;

/** No horizontal scroll, and the bottom bar (when shown) inside the viewport. */
async function expectNoOverflow(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  const bar = await page.evaluate(() => {
    const el = document.querySelector('.bottom-nav');
    if (!el) return null;
    const { left, right } = el.getBoundingClientRect();
    return { left, right, overflow: el.scrollWidth > el.clientWidth };
  });
  if (bar) {
    expect(bar.overflow).toBe(false);
    expect(bar.left).toBeGreaterThanOrEqual(0);
    expect(bar.right).toBeLessThanOrEqual(WIDTH);
  }
}

test('header and pages do not overflow at 360 px wide', async ({ page }, testInfo) => {
  const tag = lettersTag();
  const song = await seedSong(
    `Titulo bem comprido para testar a quebra de linha do cabecalho ${tag}`,
    `Cantor com um nome tambem muito comprido para o teste ${tag}`,
    [{ key: 'C' }, { key: 'D' }, { key: 'Eb' }, { key: 'F#' }, { key: 'G' }, { key: 'A' }],
  );
  await page.setViewportSize({ width: WIDTH, height: 740 });
  await signInAs(page, ADMIN, 'Admin');

  await expectNoOverflow(page);
  await shot(page, testInfo, 'layout-360-home');

  await page.goto(`/musicas/${song.id}`);
  await expectPdfRendered(page);
  await expectNoOverflow(page);
  await shot(page, testInfo, 'layout-360-viewer');

  await page.getByRole('button', { name: /Mudar tom/ }).click();
  await expect(page.getByText('Preparando…')).toHaveCount(0);
  await expectNoOverflow(page);
  await shot(page, testInfo, 'layout-360-key-panel');

  await page.goto('/pessoas');
  await expect(page.getByRole('heading', { name: 'Pessoas' })).toBeVisible();
  await expect(page.getByLabel(/^Papel de /).first()).toBeVisible();
  await expectNoOverflow(page);
  await shot(page, testInfo, 'layout-360-people');
});

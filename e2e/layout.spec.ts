import type { Page } from '@playwright/test';
import { expect, expectPdfRendered, shot, signInAs, ADMIN, test } from './fixtures/app';
import { seedSong } from './fixtures/emulator';
import { lettersTag } from './fixtures/names';

const WIDTH = 360;

/** No horizontal scroll, and every header control inside the viewport. */
async function expectNoOverflow(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  const header = await page.evaluate(() => {
    const inner = document.querySelector('.header-inner')!;
    const rights = [...inner.children].map((el) => el.getBoundingClientRect().right);
    return { overflow: inner.scrollWidth > inner.clientWidth, maxRight: Math.max(...rights) };
  });
  expect(header.overflow).toBe(false);
  expect(header.maxRight).toBeLessThanOrEqual(WIDTH);
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

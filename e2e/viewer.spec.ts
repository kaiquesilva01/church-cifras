import { chip, expect, expectPdfRendered, shot, signInAs, ADMIN, test } from './fixtures/app';
import { seedSong } from './fixtures/emulator';
import { lettersTag } from './fixtures/names';

test('viewer shows the keys and switches between them', async ({
  page,
}, testInfo) => {
  const tag = lettersTag();
  const song = await seedSong(`Estrada Antiga ${tag}`, `Cantor Teste ${tag}`, [
    { key: 'C' },
    { key: 'D' },
  ]);
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/musicas/${song.id}?tom=C`);

  await expect(chip(page, song.title, 'C')).toHaveAttribute('aria-current', 'true');
  await expect(chip(page, song.title, 'D')).toBeVisible();
  await expectPdfRendered(page);
  await shot(page, testInfo, 'viewer-1-key-c');

  await chip(page, song.title, 'D').click();
  await expect(page).toHaveURL(/tom=D$/);
  await expect(chip(page, song.title, 'D')).toHaveAttribute('aria-current', 'true');
  await expect(chip(page, song.title, 'C')).not.toHaveAttribute('aria-current', 'true');
  await expectPdfRendered(page);
  await shot(page, testInfo, 'viewer-2-key-d');
  await expect(page.getByRole('button', { name: 'Baixar PDF' })).toHaveCount(0);
});

test('the pdf can be maximized to read it full screen and restored', async ({ page }) => {
  const tag = lettersTag();
  const song = await seedSong(`Tela Cheia ${tag}`, `Cantor Teste ${tag}`, [{ key: 'C' }]);
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/musicas/${song.id}?tom=C`);
  await expectPdfRendered(page);

  const viewport = page.viewportSize()!;
  await page.getByRole('button', { name: 'Tela cheia' }).click();
  const frame = page.locator('.pdf-frame');
  await expect(frame).toHaveClass(/is-fullscreen/);
  await expect(frame).toHaveCSS('position', 'fixed');
  const box = (await frame.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
  expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);
  await expectPdfRendered(page);

  await page.getByRole('button', { name: 'Sair da tela cheia' }).click();
  await expect(frame).not.toHaveClass(/is-fullscreen/);
  await expect(page.getByRole('button', { name: 'Tela cheia' })).toBeVisible();
});

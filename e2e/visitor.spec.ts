import { expect, expectPdfRendered, newAccount, shot, signInAs, test } from './fixtures/app';
import { seedSong } from './fixtures/emulator';
import { lettersTag } from './fixtures/names';

test('visitor can read and download but cannot create, change keys or manage', async ({
  page,
}, testInfo) => {
  const tag = lettersTag();
  const song = await seedSong(`Sol da Manha ${tag}`, `Cantor Teste ${tag}`, [{ key: 'C' }]);
  await signInAs(page, newAccount('visitante'), 'Visitante');

  // Home: the song is there, but no way to create one and no admin navigation.
  await page.getByRole('searchbox', { name: 'Buscar música ou cantor…' }).fill(song.title);
  await expect(page.locator('a.list-main', { hasText: song.title })).toBeVisible();
  await expect(page.getByRole('link', { name: /Nova cifra/ })).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Mais' })
    .click();
  await expect(page.getByRole('link', { name: /Admin/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Importar' })).toHaveCount(0);
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Músicas' })
    .click();
  await page.getByRole('searchbox', { name: 'Buscar música ou cantor…' }).fill(song.title);
  await shot(page, testInfo, 'visitor-1-home');

  // Viewer: PDF and share only.
  await page.locator('a.list-main', { hasText: song.title }).click();
  await expectPdfRendered(page);
  await expect(page.getByRole('button', { name: /Mudar tom/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gerenciar' })).toHaveCount(0);
  await shot(page, testInfo, 'visitor-2-viewer');

  // Restricted routes bounce back to the home page.
  for (const path of ['/nova', '/pessoas', '/importar']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('searchbox', { name: 'Buscar música ou cantor…' })).toBeVisible();
  }
});

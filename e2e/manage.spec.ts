import { chip, expect, shot, signInAs, ADMIN, test } from './fixtures/app';
import { seedSong } from './fixtures/emulator';
import { lettersTag } from './fixtures/names';

test('admin edits the name and singer of a song', async ({ page }, testInfo) => {
  const tag = lettersTag();
  const song = await seedSong(`Nome Antigo ${tag}`, `Cantor Antigo ${tag}`, [{ key: 'C' }]);
  const newTitle = `Nome Novo ${tag}`;
  const newArtist = `Cantor Novo ${tag}`;
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/musicas/${song.id}`);

  await page.getByRole('button', { name: 'Gerenciar' }).click();
  await page.getByRole('button', { name: 'Editar nome e cantor' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar nome e cantor' });
  await dialog.getByLabel('Música', { exact: true }).fill(newTitle);
  await dialog.getByLabel('Cantor', { exact: true }).fill(newArtist);
  await shot(page, testInfo, 'manage-1-edit-dialog');
  await dialog.getByRole('button', { name: 'Salvar' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Dados atualizados.' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(newTitle) }).first()).toBeVisible();
  await expect(page.getByText(newArtist, { exact: true })).toBeVisible();
  await expect(chip(page, newTitle, 'C')).toBeVisible();
  await shot(page, testInfo, 'manage-2-edited');
});

test('admin deletes one key and the viewer moves to the remaining one', async ({
  page,
}, testInfo) => {
  const tag = lettersTag();
  const song = await seedSong(`Dois Tons ${tag}`, `Cantor Teste ${tag}`, [
    { key: 'C' },
    { key: 'D' },
  ]);
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/musicas/${song.id}?tom=D`);
  await expect(chip(page, song.title, 'D')).toHaveAttribute('aria-current', 'true');

  await page.getByRole('button', { name: 'Gerenciar' }).click();
  await page.getByRole('button', { name: 'Apagar tom D' }).click();
  const dialog = page.getByRole('dialog', { name: 'Apagar tom D' });
  await expect(dialog).toContainText('O PDF será removido.');
  await shot(page, testInfo, 'manage-3-delete-key-dialog');
  await dialog.getByRole('button', { name: 'Apagar tom', exact: true }).click();

  await expect(page).toHaveURL(/tom=C$/);
  await expect(chip(page, song.title, 'D')).toHaveCount(0);
  await expect(chip(page, song.title, 'C')).toHaveAttribute('aria-current', 'true');
});

test('admin deletes a whole song after confirming with Apagar música', async ({ page }, testInfo) => {
  const tag = lettersTag();
  const song = await seedSong(`Para Apagar ${tag}`, `Cantor Teste ${tag}`, [{ key: 'G' }]);
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/musicas/${song.id}`);

  await page.getByRole('button', { name: 'Gerenciar' }).click();
  await page.getByRole('button', { name: 'Apagar música' }).click();
  const dialog = page.getByRole('dialog', { name: 'Apagar música' });
  const confirm = dialog.getByRole('button', { name: 'Apagar música' });
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await expect(confirm).toBeEnabled();
  await shot(page, testInfo, 'manage-4-delete-song-dialog');
  await confirm.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('status').filter({ hasText: 'Música apagada.' })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Buscar música ou cantor…' }).fill(song.title);
  await expect(page.getByText(`Nada encontrado para “${song.title}”.`)).toBeVisible();
});

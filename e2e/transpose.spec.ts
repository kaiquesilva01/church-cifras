import { chip, expect, expectPdfRendered, shot, signInAs, ADMIN, test } from './fixtures/app';
import { CROWDED_LINES } from './fixtures/pdf';
import { seedSong } from './fixtures/emulator';
import { lettersTag } from './fixtures/names';

const keyButton = (page: import('@playwright/test').Page, key: string) =>
  page.getByRole('button', { name: key, exact: true });

async function openPanel(page: import('@playwright/test').Page, original: string) {
  await page.getByRole('button', { name: /Mudar tom/ }).click();
  await expect(
    page.getByRole('heading', { name: `Mudar tom · original ${original}` }),
  ).toBeVisible();
  // The source PDF is read and the fonts loaded before the keys can be picked.
  await expect(page.getByText('Preparando…')).toHaveCount(0);
}

test('Mudar tom previews, confirms and opens the new key', async ({ page }, testInfo) => {
  const tag = lettersTag();
  const song = await seedSong(`Todo o Vale ${tag}`, `Cantor Teste ${tag}`, [{ key: 'C' }]);
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/musicas/${song.id}`);
  await expectPdfRendered(page);

  await openPanel(page, 'C');
  await keyButton(page, 'D').click();
  await expect(keyButton(page, 'D')).toHaveAttribute('aria-pressed', 'true');
  // Preview drawn over the page, nothing saved yet.
  await expect(page.getByRole('button', { name: 'Confirmar D' })).toBeEnabled();
  await expect(chip(page, song.title, 'D')).toHaveCount(0);
  await shot(page, testInfo, 'transpose-1-preview');

  await page.getByRole('button', { name: 'Confirmar D' }).click();
  await expect(page).toHaveURL(/tom=D$/);
  await expect(chip(page, song.title, 'D')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('heading', { name: /Mudar tom/ })).toHaveCount(0);
  await expectPdfRendered(page);
  await shot(page, testInfo, 'transpose-2-new-key-open');

  // The generated key is now saved: the panel marks it.
  await openPanel(page, 'C');
  await expect(keyButton(page, 'D, salvo')).toBeVisible();
});

test('Mudar tom opens a key that is already saved instead of generating it', async ({
  page,
}, testInfo) => {
  const tag = lettersTag();
  const song = await seedSong(`Passos Leves ${tag}`, `Cantor Teste ${tag}`, [
    { key: 'C' },
    { key: 'D' },
  ]);
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/musicas/${song.id}?tom=C`);
  await expectPdfRendered(page);

  await openPanel(page, 'C');
  await keyButton(page, 'D, salvo').click();
  await shot(page, testInfo, 'transpose-3-saved-key');
  await page.getByRole('button', { name: 'Abrir D' }).click();
  await expect(page).toHaveURL(/tom=D$/);
  await expect(chip(page, song.title, 'D')).toHaveAttribute('aria-current', 'true');
});

test('Mudar tom warns about chords that would touch their neighbours', async ({
  page,
}, testInfo) => {
  const tag = lettersTag();
  const song = await seedSong(`Canto Apertado ${tag}`, `Cantor Teste ${tag}`, [
    { key: 'C', chordLines: CROWDED_LINES },
  ]);
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/musicas/${song.id}`);
  await expectPdfRendered(page);

  await openPanel(page, 'C');
  await keyButton(page, 'C#').click();
  await expect(page.getByRole('status').filter({ hasText: /encostar no vizinho/ })).toBeVisible();
  await shot(page, testInfo, 'transpose-4-collision-warning');

  // Cancelling leaves the song untouched.
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('heading', { name: /Mudar tom/ })).toHaveCount(0);
  await expect(chip(page, song.title, 'C#')).toHaveCount(0);
});

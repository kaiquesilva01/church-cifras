import { chip, expect, expectPdfRendered, shot, signInAs, ADMIN, test } from './fixtures/app';
import { seedSong } from './fixtures/emulator';
import { lettersTag } from './fixtures/names';

test('viewer shows the keys, switches between them and downloads the PDF', async ({
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

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /PDF$/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${song.title} - ${song.artist} (D).pdf`);
});

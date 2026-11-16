import { expect, expectPdfRendered, chip, shot, signInAs, ADMIN, test } from './fixtures/app';
import { syntheticPdf } from './fixtures/pdf';
import { lettersTag } from './fixtures/names';

test('admin uploads a synthetic PDF, reviews the suggestions and saves', async ({
  page,
}, testInfo) => {
  const tag = lettersTag();
  const title = `Musica Teste ${tag}`;
  const artist = `Cantor Teste ${tag}`;
  await signInAs(page, ADMIN, 'Admin');

  await page.getByRole('link', { name: /Nova cifra/ }).click();
  await expect(page.getByRole('heading', { name: 'Nova cifra' })).toBeVisible();
  await shot(page, testInfo, 'upload-1-empty');

  await page.getByLabel('Escolher PDF').setInputFiles({
    name: `${title} - ${artist} (C).pdf`,
    mimeType: 'application/pdf',
    buffer: await syntheticPdf({ title, artist, key: 'C' }),
  });

  await expect(page.getByRole('status').filter({ hasText: '15 acordes' })).toBeVisible();
  // Suggestions read from the PDF: title, artist and key, each flagged as read from the PDF.
  await expect(page.getByLabel('Música', { exact: true })).toHaveValue(title);
  await expect(page.getByLabel('Cantor', { exact: true })).toHaveValue(artist);
  await expect(page.getByLabel('Tom', { exact: true })).toHaveValue('C');
  await expect(page.getByText('· lido do PDF')).toHaveCount(3);
  await shot(page, testInfo, 'upload-2-suggestions');

  await page.getByRole('button', { name: 'Salvar cifra' }).click();

  await expect(page).toHaveURL(/\/musicas\/[^/?]+\?tom=C$/);
  await expect(chip(page, title, 'C')).toHaveAttribute('aria-current', 'true');
  await expectPdfRendered(page);
  await shot(page, testInfo, 'upload-3-saved-viewer');
});

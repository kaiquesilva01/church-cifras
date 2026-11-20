import { readFile } from 'node:fs/promises';
import { expect, shot, signInAs, ADMIN, test } from './fixtures/app';
import { lettersTag } from './fixtures/names';
import { syntheticPdf } from './fixtures/pdf';

test('admin imports two synthetic PDFs in batch, ignoring a non-PDF, and downloads the CSV', async ({
  page,
}, testInfo) => {
  const tag = lettersTag();
  const artist = `Cantor Lote ${tag}`;
  const files = [
    { title: `Lote Primeira ${tag}`, key: 'C' },
    { title: `Lote Segunda ${tag}`, key: 'G' },
  ];
  await signInAs(page, ADMIN, 'Admin');
  // Admins reach the batch import from Mais.
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Mais' })
    .click();
  await page.getByRole('link', { name: /Importar/ }).click();
  await expect(page.getByRole('heading', { name: 'Importar em lote' })).toBeVisible();
  await shot(page, testInfo, 'import-1-empty');

  const pdfs = await Promise.all(
    files.map(async ({ title, key }) => ({
      name: `${title} - ${artist} (${key}).pdf`,
      mimeType: 'application/pdf',
      buffer: await syntheticPdf({ title, artist, key }),
    })),
  );
  await page
    .getByLabel('Escolher arquivos')
    .setInputFiles([
      ...pdfs,
      { name: `notas ${tag}.txt`, mimeType: 'text/plain', buffer: Buffer.from('apenas texto') },
    ]);

  await expect(page.getByText('Ignoramos 1 arquivo(s) que não são PDF.')).toBeVisible();
  for (const [index, { title, key }] of files.entries()) {
    const fileName = pdfs[index]!.name;
    await expect(page.getByLabel(`Música de ${fileName}`, { exact: true })).toHaveValue(title);
    await expect(page.getByLabel(`Cantor de ${fileName}`, { exact: true })).toHaveValue(artist);
    await expect(page.getByLabel(`Tom de ${fileName}`, { exact: true })).toHaveValue(key);
  }
  await expect(page.locator('.pill', { hasText: /^pronto$/ })).toHaveCount(2);
  await expect(page.getByText('2 arquivos · 2 prontos')).toBeVisible();
  await shot(page, testInfo, 'import-2-rows-ready');

  // CSV report of what did not get in (here only the header: every row is ready).
  const csvPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Relatório CSV/ }).click();
  const csv = await csvPromise;
  expect(csv.suggestedFilename()).toBe('relatorio-importacao.csv');
  const text = await readFile(await csv.path(), 'utf8');
  // UTF-8 BOM first so that Excel reads the accents.
  expect(text.charCodeAt(0)).toBe(0xfeff);
  const header = text.slice(1).split(String.fromCharCode(13, 10))[0];
  expect(header).toBe('arquivo;música;cantor;tom;status;detalhe');

  await page.getByRole('button', { name: 'Importar 2 prontos' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: '2 importados · 0 já existiam · 0 com erro' }),
  ).toBeVisible();
  await expect(page.locator('.pill', { hasText: /^importado$/ })).toHaveCount(2);
  await shot(page, testInfo, 'import-3-done');

  // Both songs are in the catalog now.
  await page.getByRole('link', { name: /Voltar/ }).click();
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Músicas' })
    .click();
  await page.getByRole('searchbox', { name: 'Buscar música, cantor ou letra…' }).fill(artist);
  for (const { title } of files) {
    await expect(page.locator('a.list-main', { hasText: title })).toBeVisible();
  }
});

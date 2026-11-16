import { expect, expectPdfRendered, shot, signInAs, ADMIN, test } from './fixtures/app';
import { seedSong } from './fixtures/emulator';
import { lettersTag } from './fixtures/names';

// The only spec that lets the service worker run (the preview build registers it).
test.use({ serviceWorkers: 'allow' });

test('the preview build serves the manifest and registers the service worker', async ({
  page,
  request,
}) => {
  await page.goto('/');

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const response = await request.get(new URL(href!, page.url()).toString());
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as Record<string, unknown> & {
    icons: Array<{ sizes: string; purpose?: string }>;
  };
  expect(manifest).toMatchObject({
    name: 'Cifras · Louvor',
    short_name: 'Cifras',
    display: 'standalone',
    lang: 'pt-BR',
    theme_color: '#4f46e5',
    background_color: '#f2f2f4',
  });
  expect(manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose}`)).toEqual(
    expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']),
  );

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(new URL('/', page.url()).toString());
});

test('a PDF opened once is served from the cache while offline', async ({
  page,
  context,
}, testInfo) => {
  const tag = lettersTag();
  const song = await seedSong(`Cache Offline ${tag}`, `Cantor Teste ${tag}`, [{ key: 'C' }]);

  // The worker does not claim the first page (no clientsClaim): reload once so it controls it.
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/musicas/${song.id}`);
  await expectPdfRendered(page);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const cache = await caches.open('cifras-pdfs');
        return (await cache.keys()).map((request) => request.url);
      }),
    )
    .toEqual([expect.stringContaining('songs%2F')]);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('link', { name: `${song.title}, tom C`, exact: true })).toBeVisible();
  await expectPdfRendered(page);
  await shot(page, testInfo, 'pwa-offline-viewer');
  await context.setOffline(false);
});

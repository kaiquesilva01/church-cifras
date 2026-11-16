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

// Plan Global Constraints / spec §6.11: an already-visited cifra shows in under 1 s on Fast 4G.
// No CPU throttling: its rate is relative to the host, so it is not comparable between a dev machine
// and a CI runner. The time is read inside the page (performance.now() is relative to the new
// navigation's timeOrigin), which leaves Playwright's own round trips out of the number.
test('an already-visited cifra paints in under 1 s on Fast 4G', async ({
  page,
  context,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'the budget is a phone metric');
  const tag = lettersTag();
  const song = await seedSong(`Revisita Rapida ${tag}`, `Cantor Teste ${tag}`, [{ key: 'C' }]);

  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  // First visit: chunks and the PDF end up in the caches.
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/musicas/${song.id}`);
  await expectPdfRendered(page);
  await expect
    .poll(() => page.evaluate(async () => (await (await caches.open('cifras-pdfs')).keys()).length))
    .toBeGreaterThan(0);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 165,
    downloadThroughput: (9 * 1024 * 1024) / 8,
    uploadThroughput: (1.5 * 1024 * 1024) / 8,
  });

  const requests: string[] = [];
  const started = Date.now();
  page.on('requestfinished', (request) =>
    requests.push(`+${Date.now() - started}ms ${request.url().slice(0, 110)}`),
  );

  await page.goto(`/musicas/${song.id}`, { waitUntil: 'commit' });
  const handle = await page.waitForFunction(
    () => {
      const canvas = document.querySelector<HTMLCanvasElement>('.pdf-page canvas');
      if (!canvas || canvas.width === 0 || canvas.height === 0) return false;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;
      const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!data) return false;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! > 0 && (data[i]! < 200 || data[i + 1]! < 200 || data[i + 2]! < 200)) {
          return { at: performance.now(), controlled: navigator.serviceWorker.controller !== null };
        }
      }
      return false;
    },
    null,
    { polling: 'raf', timeout: 15_000 },
  );
  const result = (await handle.jsonValue()) as { at: number; controlled: boolean };
  const elapsed = Math.round(result.at);
  expect(result.controlled, 'the revisit must be served under the service worker').toBe(true);

  console.log([`revisit paint: ${elapsed} ms`, ...requests].join(String.fromCharCode(10)));
  testInfo.annotations.push({ type: 'revisit-paint-ms', description: String(elapsed) });
  expect(elapsed, `revisit took ${elapsed} ms`).toBeLessThan(1000);
});

import type { Page } from '@playwright/test';
import { ADMIN, chip, expect, expectPdfRendered, signInAs, test } from './fixtures/app';
import {
  clearSetlists,
  seedPads,
  seedSetlist,
  seedSong,
  todayInSaoPaulo,
} from './fixtures/emulator';
import { lettersTag } from './fixtures/names';

// Audio output cannot be checked in CI: these tests assert UI state, the Storage requests the pad
// makes and that no Web Audio error shows up.
const padRequests = (page: Page): string[] => {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('pads%2Fv1%2FDS')) urls.push(request.url());
  });
  return urls;
};
const requested = (urls: string[], file: string) => urls.some((url) => url.includes(`${file}.m4a`));

// Every pageerror fails a test; console errors fail it too, except this short allowlist of noise
// that does not come from the pad.
const BENIGN_CONSOLE_ERRORS: RegExp[] = [];
const problems = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  problems.set(page, list);
  page.on('pageerror', (error) => list.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !BENIGN_CONSOLE_ERRORS.some((re) => re.test(text))) {
      list.push(`console.error: ${text}`);
    }
  });
});
test.afterEach(async ({ page }) => {
  expect(problems.get(page)).toEqual([]);
});

const padButton = (page: Page) => page.locator('.pad-control').getByRole('button');
const volume = (page: Page) => page.getByRole('slider', { name: 'Volume do pad' });
const bar = (page: Page) => page.getByRole('navigation', { name: 'Repertório' });
const home = (page: Page) => page.locator('a.brand');
/** Client-side navigation from the home page: no reload, so the provider keeps its state. */
async function openFromSearch(page: Page, title: string): Promise<void> {
  await page.getByRole('searchbox', { name: 'Buscar música ou cantor…' }).fill(title);
  await page.locator('a.list-main', { hasText: title }).click();
}

test.beforeAll(async () => {
  await seedPads();
});
test.beforeEach(async () => {
  await clearSetlists();
});
test.afterAll(async () => {
  await clearSetlists();
});

test('pad button toggles, follows the key chip and does not cross to another visit', async ({
  page,
}) => {
  const tag = lettersTag();
  const song = await seedSong(`Aurora ${tag}`, `Cantor Teste ${tag}`, [{ key: 'C' }, { key: 'D' }]);
  const urls = padRequests(page);
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/musicas/${song.id}?tom=C`);
  await expectPdfRendered(page);

  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'false');
  await padButton(page).click();
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => requested(urls, 'DS04-C')).toBe(true);
  await expect(volume(page)).toBeVisible();

  // The key chip of the same cifra moves the pad to the new tonic and keeps it on.
  // The viewer's prefetch also requests DS06-D once the D cifra is ready, so the request alone
  // does not prove the follow; the 'Pad D' label and the pressed state below do.
  urls.length = 0;
  await chip(page, song.title, 'D').click();
  await expect.poll(() => requested(urls, 'DS06-D')).toBe(true);
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(padButton(page)).toHaveText('Pad D');

  await padButton(page).click();
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(volume(page)).toHaveCount(0);

  // Outside a setlist the pad does not cross to another visit of the cifra.
  await padButton(page).click();
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'true');
  await home(page).click();
  await expect(page).toHaveURL(/\/$/);
  await openFromSearch(page, song.title);
  await expectPdfRendered(page);
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'false');
});

test('pad continues across the songs of a setlist and shows the compact control', async ({
  page,
}) => {
  const tag = lettersTag();
  const aurora = await seedSong(`Aurora ${tag}`, `Cantor Teste ${tag}`, [{ key: 'C' }]);
  const brisa = await seedSong(`Brisa ${tag}`, `Cantor Teste ${tag}`, [{ key: 'D' }]);
  const id = await seedSetlist(todayInSaoPaulo(), 'Culto', [
    { songId: aurora.id, key: 'C' },
    { songId: brisa.id, key: 'D' },
  ]);
  const urls = padRequests(page);
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/repertorios/${id}`);
  await page.locator('li.setlist-item', { hasText: aurora.title }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(aurora.title);
  await expectPdfRendered(page);

  await padButton(page).click();
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => requested(urls, 'DS04-C')).toBe(true);
  await expect(padButton(page)).toHaveText('Pad C');

  // D may already be prefetched from the setlist, so the follow is asserted on the UI state.
  await bar(page)
    .getByRole('button', { name: /Próxima/ })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(brisa.title);
  await expect(padButton(page)).toHaveText('Pad D');
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'true');

  // Back on the setlist page the compact control takes over, and "Parar" turns the pad off.
  await page.getByRole('link', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/repertorios/${id}$`));
  await expect(page.getByText('Pad D tocando')).toBeVisible();
  await page.getByRole('button', { name: 'Parar', exact: true }).click();
  await expect(page.getByText('Pad D tocando')).toHaveCount(0);

  // Leaving the setlist for the home page with the pad on stops it for good.
  await page.locator('li.setlist-item', { hasText: brisa.title }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(brisa.title);
  await padButton(page).click();
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'true');
  await home(page).click();
  await expect(page).toHaveURL(/\/$/);
  await page
    .getByRole('region', { name: 'Próximo culto' })
    .getByRole('link', { name: /Culto/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/repertorios/${id}$`));
  await expect(page.locator('li.setlist-item')).toHaveCount(2);
  await expect(page.locator('.pad-mini')).toHaveCount(0);
  await expect(page.getByText(/Pad .* tocando/)).toHaveCount(0);
  // ...and the cifra opened from the setlist starts with the pad off.
  await page.locator('li.setlist-item', { hasText: aurora.title }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(aurora.title);
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'false');
});

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

const errorsOf = (page: Page): string[] => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
};
const padErrors = (errors: string[]) =>
  errors.filter((text) => /pad|audio|decode|AudioContext/i.test(text));

const padButton = (page: Page) => page.locator('.pad-control').getByRole('button');
const volume = (page: Page) => page.getByRole('slider', { name: 'Volume do pad' });
const bar = (page: Page) => page.getByRole('navigation', { name: 'Repertório' });
const home = (page: Page) => page.locator('a.brand');

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
  const errors = errorsOf(page);
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/musicas/${song.id}?tom=C`);
  await expectPdfRendered(page);

  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'false');
  await padButton(page).click();
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => requested(urls, 'DS04-C')).toBe(true);
  await expect(volume(page)).toBeVisible();

  // The key chip of the same cifra moves the pad to the new tonic and keeps it on.
  await chip(page, song.title, 'D').click();
  await expect.poll(() => requested(urls, 'DS06-D')).toBe(true);
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'true');

  await padButton(page).click();
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(volume(page)).toHaveCount(0);

  // Outside a setlist the pad does not cross to another visit of the cifra.
  await padButton(page).click();
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'true');
  await home(page).click();
  await page.goto(`/musicas/${song.id}?tom=C`);
  await expectPdfRendered(page);
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'false');

  expect(padErrors(errors)).toEqual([]);
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
  const errors = errorsOf(page);
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/repertorios/${id}`);
  await page.locator('li.setlist-item', { hasText: aurora.title }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(aurora.title);
  await expectPdfRendered(page);

  await padButton(page).click();
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => requested(urls, 'DS04-C')).toBe(true);

  await bar(page)
    .getByRole('button', { name: /Próxima/ })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(brisa.title);
  await expect.poll(() => requested(urls, 'DS06-D')).toBe(true);
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'true');

  // Back on the setlist page the compact control takes over, and "Parar" turns the pad off.
  await page.getByRole('link', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/repertorios/${id}$`));
  await expect(page.getByText('Pad D tocando')).toBeVisible();
  await page.getByRole('button', { name: 'Parar' }).click();
  await expect(page.getByText('Pad D tocando')).toHaveCount(0);

  // Leaving the setlist for the home page with the pad on stops it for good.
  await page.locator('li.setlist-item', { hasText: brisa.title }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(brisa.title);
  await padButton(page).click();
  await expect(padButton(page)).toHaveAttribute('aria-pressed', 'true');
  await home(page).click();
  await page.goto(`/repertorios/${id}`);
  await expect(page.locator('li.setlist-item')).toHaveCount(2);
  await expect(page.locator('.pad-mini')).toHaveCount(0);
  await expect(page.getByText(/Pad .* tocando/)).toHaveCount(0);

  expect(padErrors(errors)).toEqual([]);
});

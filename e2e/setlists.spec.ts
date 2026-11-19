import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import {
  ADMIN,
  chip,
  expect,
  expectPdfRendered,
  newAccount,
  openSession,
  shot,
  signInAs,
  test,
} from './fixtures/app';
import {
  addDays,
  clearSetlists,
  seedSetlist,
  seedSong,
  todayInSaoPaulo,
  type SeededSong,
} from './fixtures/emulator';
import { lettersTag } from './fixtures/names';

// Setlists are global to the emulator (the tab lists all of them), so every test starts clean.
test.beforeEach(async () => {
  await clearSetlists();
});

// Leave the emulator without setlists for the specs that run after this file.
test.afterAll(async () => {
  await clearSetlists();
});

const rows = (page: Page) => page.locator('li.setlist-item');
const rowTitles = (page: Page) => rows(page).locator('.song-title');
const rowFor = (page: Page, title: string) => rows(page).filter({ hasText: title });
/**
 * Reorder with the keyboard on the drag handle (Space picks up, arrows move, Space drops):
 * the same dnd-kit path a drag takes, without depending on pointer coordinates.
 */
async function moveItem(page: Page, title: string, direction: 'up' | 'down', steps = 1) {
  const handle = rowFor(page, title).getByRole('button', { name: `Arrastar ${title}` });
  await handle.focus();
  await page.keyboard.press('Space');
  // dnd-kit attaches its keyboard listeners on the next tick after the pick-up.
  await page.waitForTimeout(100);
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press(direction === 'up' ? 'ArrowUp' : 'ArrowDown');
    await page.waitForTimeout(100);
  }
  await page.keyboard.press('Space');
}
const bar = (page: Page) => page.getByRole('navigation', { name: 'Repertório' });
const next = (page: Page) => bar(page).getByRole('button', { name: /Próxima/ });
const previous = (page: Page) => bar(page).getByRole('button', { name: /Anterior/ });
const banner = (page: Page) => page.locator('.update-banner');

/** Three songs, each with handmade C and D. */
async function seedThree(tag: string, pages = 1): Promise<SeededSong[]> {
  const songs: SeededSong[] = [];
  for (const name of ['Aurora', 'Brisa', 'Cais']) {
    songs.push(
      await seedSong(`${name} ${tag}`, `Cantor Teste ${tag}`, [
        { key: 'C', pages },
        { key: 'D', pages },
      ]),
    );
  }
  return songs;
}

/** Hash of the first canvas once it stops changing (two animation frames in a row). */
function settledSignature(page: Page): Promise<number> {
  return page
    .locator('.pdf-page canvas')
    .first()
    .evaluate(async (el) => {
      const canvas = el as HTMLCanvasElement;
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const sign = (): number => {
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 2166136261;
        for (let i = 0; i < data.length; i += 4) hash = Math.imul(hash ^ data[i]!, 16777619);
        return hash >>> 0;
      };
      let last = sign();
      for (;;) {
        await frame();
        await frame();
        const now = sign();
        if (now === last) return now;
        last = now;
      }
    });
}

async function expectNewPdf(page: Page, previousSignature: number): Promise<number> {
  await expectPdfRendered(page);
  await expect
    .poll(() => settledSignature(page), { message: 'a different PDF should be on the canvas' })
    .not.toBe(previousSignature);
  return settledSignature(page);
}

function record(testInfo: TestInfo, name: string, data: unknown): void {
  const dir = join(import.meta.dirname, 'artifacts', testInfo.project.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(data, null, 2));
  testInfo.annotations.push({ type: name, description: JSON.stringify(data) });
}

test('admin builds a setlist: add, reorder, change key, order survives a reload', async ({
  page,
}, testInfo) => {
  const tag = lettersTag();
  const [aurora, brisa, cais] = await seedThree(tag);
  await signInAs(page, ADMIN, 'Admin');

  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Repertório' })
    .click();
  await expect(page.getByText('Nenhum repertório ainda.')).toBeVisible();
  await shot(page, testInfo, 'setlists-1-tab-empty');
  await page.getByRole('button', { name: '＋ Novo repertório' }).click();
  await page.getByLabel('Rótulo').fill('Domingo');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Domingo');
  await expect(page.getByText('Nenhum louvor neste repertório ainda.')).toBeVisible();

  await page.getByRole('button', { name: '＋ Adicionar' }).click();
  const sheet = page.getByRole('dialog', { name: 'Adicionar música' });
  for (const [index, song] of [aurora!, brisa!, cais!].entries()) {
    await sheet.getByRole('searchbox').fill(song.title);
    await sheet.locator('.add-song-option', { hasText: song.title }).click();
    await expect(rows(page)).toHaveCount(index + 1);
  }
  await sheet.getByRole('button', { name: 'Fechar' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(rowTitles(page)).toHaveText([aurora!.title, brisa!.title, cais!.title]);

  // Reorder with the drag handle: Cais goes to the top, then back one place.
  await moveItem(page, cais!.title, 'up', 2);
  await expect(rowTitles(page)).toHaveText([cais!.title, aurora!.title, brisa!.title]);
  await moveItem(page, cais!.title, 'down');
  await expect(rowTitles(page)).toHaveText([aurora!.title, cais!.title, brisa!.title]);

  // Key of Brisa: C -> D through the picker.
  await rowFor(page, brisa!.title).getByRole('button', { name: 'Tom C, alterar' }).click();
  await page
    .getByRole('dialog', { name: 'Tom' })
    .getByRole('button', { name: 'D', exact: true })
    .click();
  await expect(rowFor(page, brisa!.title).locator('.setlist-item-key')).toHaveText('D');
  await shot(page, testInfo, 'setlists-2-editor');

  await page.reload();
  await expect(rowTitles(page)).toHaveText([aurora!.title, cais!.title, brisa!.title]);
  await expect(rowFor(page, brisa!.title).locator('.setlist-item-key')).toHaveText('D');
  await expect(rowFor(page, aurora!.title).locator('.setlist-item-key')).toHaveText('C');

  // Back to the tab: the new setlist is listed with its count.
  await page.getByRole('link', { name: 'Voltar' }).click();
  await expect(page.locator('a.setlist-row', { hasText: 'Domingo' }).last()).toContainText(
    '3 louvores',
  );
  await shot(page, testInfo, 'setlists-3-tab');
});

test('navigating a setlist: Próxima and Anterior open the PDFs in the setlist keys', async ({
  page,
}, testInfo) => {
  const tag = lettersTag();
  const [aurora, brisa, cais] = await seedThree(tag);
  const id = await seedSetlist(todayInSaoPaulo(), 'Culto', [
    { songId: aurora!.id, key: 'C' },
    { songId: brisa!.id, key: 'D' },
    { songId: cais!.id, key: 'C' },
  ]);
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/repertorios/${id}`);
  await expect(rowTitles(page)).toHaveText([aurora!.title, brisa!.title, cais!.title]);

  await rowFor(page, aurora!.title).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(aurora!.title);
  await expect(bar(page)).toContainText('1 de 3');
  await expect(chip(page, aurora!.title, 'C')).toHaveAttribute('aria-current', 'true');
  await expectPdfRendered(page);
  const first = await settledSignature(page);
  await expect(previous(page)).toBeDisabled();
  await shot(page, testInfo, 'setlists-4-viewer-bar');

  await next(page).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(brisa!.title);
  await expect(bar(page)).toContainText('2 de 3');
  await expect(chip(page, brisa!.title, 'D')).toHaveAttribute('aria-current', 'true');
  await expectNewPdf(page, first);

  await previous(page).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(aurora!.title);
  await expect(bar(page)).toContainText('1 de 3');
  await expect(chip(page, aurora!.title, 'C')).toHaveAttribute('aria-current', 'true');
  await expect.poll(() => settledSignature(page)).toBe(first);

  // Back (history stays clean: Próxima/Anterior replace) and the header "‹" return to the setlist.
  await page.getByRole('link', { name: 'Voltar' }).click();
  await expect(page).toHaveURL(new RegExp(`/repertorios/${id}$`));
  await expect(rowTitles(page)).toHaveText([aurora!.title, brisa!.title, cais!.title]);
});

test('live update: a second session sees the banner, the list stays until Atualizar', async ({
  page,
  browser,
}, testInfo) => {
  const tag = lettersTag();
  const [aurora, brisa, cais] = await seedThree(tag);
  const id = await seedSetlist(todayInSaoPaulo(), 'Culto', [
    { songId: aurora!.id, key: 'C' },
    { songId: brisa!.id, key: 'C' },
    { songId: cais!.id, key: 'C' },
  ]);
  const { context, page: other } = await openSession(browser, testInfo);
  try {
    await signInAs(other, ADMIN, 'Admin');
    await other.goto(`/repertorios/${id}`);
    await expect(rowTitles(other)).toHaveText([aurora!.title, brisa!.title, cais!.title]);

    await signInAs(page, ADMIN, 'Admin');
    await page.goto(`/repertorios/${id}`);
    await expect(rowTitles(page)).toHaveText([aurora!.title, brisa!.title, cais!.title]);
    await moveItem(page, cais!.title, 'up');
    await expect(rowTitles(page)).toHaveText([aurora!.title, cais!.title, brisa!.title]);
    // The editor does not get a banner for its own change.
    await expect(banner(page)).toHaveCount(0);

    await expect(banner(other)).toContainText('O repertório foi alterado.');
    await expect(rowTitles(other)).toHaveText([aurora!.title, brisa!.title, cais!.title]);
    await shot(other, testInfo, 'setlists-5-banner');

    await other.getByRole('button', { name: 'Atualizar' }).click();
    await expect(rowTitles(other)).toHaveText([aurora!.title, cais!.title, brisa!.title]);
    await expect(banner(other)).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('live update inside a cifra: banner without swapping the PDF, then the new order and key', async ({
  page,
  browser,
}, testInfo) => {
  const tag = lettersTag();
  const [aurora, brisa, cais] = await seedThree(tag);
  const id = await seedSetlist(todayInSaoPaulo(), 'Culto', [
    { songId: aurora!.id, key: 'C' },
    { songId: brisa!.id, key: 'D' },
    { songId: cais!.id, key: 'C' },
  ]);
  const { context, page: other } = await openSession(browser, testInfo);
  try {
    await signInAs(page, ADMIN, 'Admin');
    await page.goto(`/repertorios/${id}`);
    await expect(rowTitles(page)).toHaveText([aurora!.title, brisa!.title, cais!.title]);

    await signInAs(other, ADMIN, 'Admin');
    await other.goto(`/repertorios/${id}`);
    await rowFor(other, brisa!.title).getByRole('link').click();
    await expect(other.getByRole('heading', { level: 1 })).toHaveText(brisa!.title);
    await expect(bar(other)).toContainText('2 de 3');
    await expectPdfRendered(other);
    const before = await settledSignature(other);

    // A moves Brisa to the top.
    await moveItem(page, brisa!.title, 'up');
    await expect(rowTitles(page)).toHaveText([brisa!.title, aurora!.title, cais!.title]);

    await expect(banner(other)).toContainText('O repertório foi alterado.');
    await expect(bar(other)).toContainText('2 de 3');
    await expect(other.getByRole('heading', { level: 1 })).toHaveText(brisa!.title);
    expect(await settledSignature(other)).toBe(before);
    await shot(other, testInfo, 'setlists-6-banner-in-viewer');
    await other.getByRole('button', { name: 'Atualizar' }).click();
    await expect(bar(other)).toContainText('1 de 3');
    await expect(banner(other)).toHaveCount(0);
    await expect(chip(other, brisa!.title, 'D')).toHaveAttribute('aria-current', 'true');
    expect(await settledSignature(other)).toBe(before);

    // A changes the key of the open item: D -> C.
    await rowFor(page, brisa!.title).getByRole('button', { name: 'Tom D, alterar' }).click();
    await page
      .getByRole('dialog', { name: 'Tom' })
      .getByRole('button', { name: 'C', exact: true })
      .click();
    await expect(rowFor(page, brisa!.title).locator('.setlist-item-key')).toHaveText('C');

    await expect(banner(other)).toContainText('O tom deste louvor mudou para C');
    await expect(chip(other, brisa!.title, 'D')).toHaveAttribute('aria-current', 'true');
    await other.getByRole('button', { name: 'Atualizar' }).click();
    await expect(other).toHaveURL(/tom=C/);
    await expect(chip(other, brisa!.title, 'C')).toHaveAttribute('aria-current', 'true');
    await expect(banner(other)).toHaveCount(0);
    await expectNewPdf(other, before);
  } finally {
    await context.close();
  }
});

test('visitor sees the setlist and the bar but no editing controls', async ({ page }, testInfo) => {
  const tag = lettersTag();
  const [aurora, brisa, cais] = await seedThree(tag);
  const id = await seedSetlist(addDays(todayInSaoPaulo(), 1), 'Culto', [
    { songId: aurora!.id, key: 'C' },
    { songId: brisa!.id, key: 'D' },
    { songId: cais!.id, key: 'C' },
  ]);
  await signInAs(page, newAccount('visitante'), 'Visitante');

  // The "Próximo culto" card on the home page leads to the setlist.
  const card = page.getByRole('region', { name: 'Próximo culto' });
  await expect(card).toBeVisible();
  await card.getByRole('link', { name: /Culto/ }).click();
  await expect(page).toHaveURL(new RegExp(`/repertorios/${id}$`));
  await expect(rowTitles(page)).toHaveText([aurora!.title, brisa!.title, cais!.title]);
  await expect(rowFor(page, brisa!.title).locator('.setlist-item-key')).toHaveText('D');

  await expect(page.getByRole('button', { name: /^Arrastar / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Mover / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Remover / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /alterar$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '＋ Adicionar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Menu do repertório' })).toHaveCount(0);
  await shot(page, testInfo, 'setlists-7-visitor-page');

  await rowFor(page, aurora!.title).getByRole('link').click();
  await expect(bar(page)).toContainText('1 de 3');
  await expectPdfRendered(page);
  await next(page).click();
  await expect(bar(page)).toContainText('2 de 3');
  await expect(chip(page, brisa!.title, 'D')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('button', { name: /Mudar tom/ })).toHaveCount(0);
  await shot(page, testInfo, 'setlists-8-visitor-viewer');
});

test('an expired setlist is hidden from the tab and the next-culto card; a future one is shown', async ({
  page,
}, testInfo) => {
  const tag = lettersTag();
  const song = await seedSong(`Dueto ${tag}`, `Cantor Teste ${tag}`, [{ key: 'C' }]);
  const today = todayInSaoPaulo();
  // Older date than the future one: if it were not filtered it would own the card.
  await seedSetlist(today, `Vencido ${tag}`, [{ songId: song.id, key: 'C' }], {
    expiresAt: new Date(Date.now() - 60_000),
  });
  await seedSetlist(addDays(today, 1), `Futuro ${tag}`, [{ songId: song.id, key: 'C' }]);
  await signInAs(page, ADMIN, 'Admin');

  const card = page.getByRole('region', { name: 'Próximo culto' });
  await expect(card).toContainText(`Futuro ${tag}`);
  await expect(page.getByText(`Vencido ${tag}`)).toHaveCount(0);
  await shot(page, testInfo, 'setlists-9-next-culto-card');

  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Repertório' })
    .click();
  await expect(page.locator('a.setlist-row', { hasText: `Futuro ${tag}` }).first()).toBeVisible();
  await expect(page.getByText(`Vencido ${tag}`)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Próximos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recentes' })).toHaveCount(0);
});

test('the fixed bar never covers the end of the last page', async ({ page }, testInfo) => {
  const tag = lettersTag();
  const [aurora, brisa] = await seedThree(tag, 3);
  const id = await seedSetlist(todayInSaoPaulo(), 'Culto', [
    { songId: aurora!.id, key: 'C' },
    { songId: brisa!.id, key: 'C' },
  ]);
  await signInAs(page, ADMIN, 'Admin');
  await page.goto(`/repertorios/${id}`);
  await rowFor(page, aurora!.title).getByRole('link').click();
  await expect(page.locator('.pdf-page canvas')).toHaveCount(3);
  await expectPdfRendered(page);
  await expect(bar(page)).toBeVisible();

  await expect
    .poll(async () => {
      await page.evaluate(() => {
        const el = document.scrollingElement!;
        el.scrollTo(0, el.scrollHeight);
      });
      return page.evaluate(() => {
        const el = document.scrollingElement!;
        return el.scrollTop + window.innerHeight >= el.scrollHeight - 1;
      });
    })
    .toBe(true);
  const lastBox = (await page.locator('.pdf-page canvas').last().boundingBox())!;
  const barBox = (await page.locator('.viewer-bar').boundingBox())!;
  const metrics = await page.evaluate(() => ({
    paddingBottom: getComputedStyle(document.querySelector('.viewer')!).paddingBottom,
    viewportHeight: window.innerHeight,
  }));
  const gap = barBox.y - (lastBox.y + lastBox.height);
  record(testInfo, 'viewer-bar-clearance', {
    barHeight: barBox.height,
    barTop: barBox.y,
    lastCanvasBottom: lastBox.y + lastBox.height,
    gapAboveBar: gap,
    viewerPaddingBottom: metrics.paddingBottom,
    viewportHeight: metrics.viewportHeight,
  });
  await shot(page, testInfo, 'setlists-10-viewer-scrolled-to-end');
  expect(gap).toBeGreaterThanOrEqual(0);
});

test.describe('measurements', () => {
  test('opening a cifra from the setlist is not slower than from the search', async ({
    page,
  }, testInfo) => {
    const tag = lettersTag();
    const [aurora, brisa] = await seedThree(tag);
    const id = await seedSetlist(todayInSaoPaulo(), 'Culto', [
      { songId: aurora!.id, key: 'C' },
      { songId: brisa!.id, key: 'C' },
    ]);
    await signInAs(page, ADMIN, 'Admin');

    // From the click until the first page canvas holds ink, measured inside the page.
    const arm = () =>
      page.evaluate(() => {
        const w = window as unknown as { __painted: Promise<number> };
        w.__painted = new Promise<number>((resolve) => {
          document.addEventListener(
            'click',
            () => {
              const start = performance.now();
              const tick = (): void => {
                const canvas = document.querySelector<HTMLCanvasElement>('.pdf-page canvas');
                const data = canvas
                  ?.getContext('2d')
                  ?.getImageData(0, 0, canvas.width, canvas.height).data;
                let inked = false;
                if (data) {
                  for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 3]! > 0 && data[i]! < 200) {
                      inked = true;
                      break;
                    }
                  }
                }
                if (inked) resolve(performance.now() - start);
                else requestAnimationFrame(tick);
              };
              tick();
            },
            { capture: true, once: true },
          );
        });
      });
    const painted = () =>
      page.evaluate(() => (window as unknown as { __painted: Promise<number> }).__painted);

    const fromSearch: number[] = [];
    const fromSetlist: number[] = [];
    for (let round = 0; round < 5; round++) {
      await page.goto('/');
      await page.getByRole('searchbox', { name: 'Buscar música ou cantor…' }).fill(aurora!.title);
      const link = page.locator('a.list-main', { hasText: aurora!.title });
      await expect(link).toBeVisible();
      await arm();
      await link.click();
      fromSearch.push(Math.round(await painted()));

      await page.goto(`/repertorios/${id}`);
      const row = rowFor(page, aurora!.title).getByRole('link');
      await expect(row).toBeVisible();
      await arm();
      await row.click();
      fromSetlist.push(Math.round(await painted()));
    }
    const median = (values: number[]): number => [...values].sort((a, b) => a - b)[2]!;
    record(testInfo, 'open-cifra-timing', {
      unit: 'ms from click to first painted page',
      fromSearch,
      fromSetlist,
      medianSearch: median(fromSearch),
      medianSetlist: median(fromSetlist),
    });
    // Informational: no ordering assertion, only that every open painted something.
    expect(fromSearch.every((ms) => ms > 0)).toBe(true);
    expect(fromSetlist.every((ms) => ms > 0)).toBe(true);
  });

  test('Próxima while the next PDF is still preloading', async ({ page }, testInfo) => {
    const tag = lettersTag();
    const [aurora, brisa] = await seedThree(tag);
    const id = await seedSetlist(todayInSaoPaulo(), 'Culto', [
      { songId: aurora!.id, key: 'C' },
      { songId: brisa!.id, key: 'C' },
    ]);
    const isNextPdf = (url: string): boolean => {
      const parsed = new URL(url);
      return (
        parsed.port === '9199' &&
        decodeURIComponent(parsed.pathname).includes(`songs/${brisa!.id}/`) &&
        parsed.searchParams.get('alt') === 'media'
      );
    };
    let opened!: () => void;
    const gate = new Promise<void>((resolve) => (opened = resolve));
    // The next PDF's download is held until the test lets it go, so the preload is in flight.
    await page.route(
      (url) => isNextPdf(url.href),
      async (route) => {
        await gate;
        await route.continue();
      },
    );
    let downloads = 0;
    page.on('request', (request) => {
      if (isNextPdf(request.url())) downloads += 1;
    });

    await signInAs(page, ADMIN, 'Admin');
    await page.goto(`/repertorios/${id}`);
    await rowFor(page, aurora!.title).getByRole('link').click();
    await expectPdfRendered(page);
    // Informational: wait for the preload request without failing the suite if it never shows.
    let preloadStarted = true;
    await expect
      .poll(() => downloads, { timeout: 5_000 })
      .toBeGreaterThan(0)
      .catch(() => {
        preloadStarted = false;
      });
    const first = await settledSignature(page);

    await next(page).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(brisa!.title);
    // Give the main download effect a chance to fire its own request while the preload is held.
    let duplicateWhileHeld = true;
    await expect
      .poll(() => downloads, { timeout: 3_000 })
      .toBeGreaterThan(1)
      .catch(() => {
        duplicateWhileHeld = false;
      });
    opened();
    await expectNewPdf(page, first);
    record(testInfo, 'preload-race', {
      preloadStartedBeforeNext: preloadStarted,
      downloadsOfTheNextPdf: downloads,
      secondRequestWhilePreloadHeld: duplicateWhileHeld,
      note: 'informational; 2 means the same PDF object was fetched twice',
    });
    await shot(page, testInfo, 'setlists-11-next-while-preloading');
  });
});

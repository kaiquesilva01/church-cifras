import { expect, test as base, type Browser, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { lettersTag } from './names';

export { expect };

export const ADMIN = { email: 'admin@cifras.local', name: 'Admin Teste' };

export interface Account {
  email: string;
  name: string;
}

export function newAccount(label: string): Account {
  const tag = lettersTag().toLowerCase();
  return { email: `${label}-${tag}@e2e.local`, name: `${label} ${tag}` };
}

/**
 * Signs in through the real Google popup of the Auth emulator: "Add new account", fill the form,
 * submit. Waits until the app shows the signed-in bottom bar.
 */
export async function signInWithPopup(page: Page, account: Account): Promise<void> {
  await page.goto('/');
  const popupPromise = page.waitForEvent('popup');
  const enter = page.getByRole('button', { name: 'Entrar com Google' });
  await enter.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await popup.locator('#accounts-list').waitFor();
  // Accounts that signed in before (the admin, across tests) are listed: reuse them.
  const existing = popup.locator('.js-reuse-account', { hasText: account.email }).first();
  if ((await existing.count()) > 0) {
    await existing.click();
  } else {
    await popup.getByRole('button', { name: /add new account/i }).click();
    await popup.getByLabel(/email/i).fill(account.email);
    await popup.getByLabel(/display name/i).fill(account.name);
    await popup.getByRole('button', { name: /sign in with google/i }).click();
  }
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
}

/**
 * Waits until the Mais tab shows the role label (the claim and users/{uid} are in place), then goes
 * back to the Músicas tab. Client-side only: no reload.
 */
export async function expectRole(
  page: Page,
  label: 'Admin' | 'Membro' | 'Visitante',
): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Principal' });
  await nav.getByRole('link', { name: 'Mais' }).click();
  await expect(page.locator('.role-badge')).toHaveText(label);
  await nav.getByRole('link', { name: 'Músicas' }).click();
}

/** Saves e2e/artifacts/<project>/<step>.png (git-ignored) for visual inspection. */
export async function shot(page: Page, testInfo: TestInfo, step: string): Promise<void> {
  const dir = join(import.meta.dirname, '..', 'artifacts', testInfo.project.name);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${step}.png`) });
}

export async function signInAs(
  page: Page,
  account: Account,
  role: 'Admin' | 'Membro' | 'Visitante',
) {
  await signInWithPopup(page, account);
  await expectRole(page, role);
}

/** The first page canvas is drawn (not blank): some pixel is not white/transparent. */
export async function expectPdfRendered(page: Page): Promise<void> {
  const canvas = page.locator('.pdf-page canvas').first();
  await expect(canvas).toBeVisible();
  await expect
    .poll(
      () =>
        canvas.evaluate((el) => {
          const c = el as HTMLCanvasElement;
          const data = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
          if (!data) return false;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3]! > 0 && (data[i]! < 200 || data[i + 1]! < 200 || data[i + 2]! < 200)) {
              return true;
            }
          }
          return false;
        }),
      { message: 'the PDF page should be painted on the canvas' },
    )
    .toBe(true);
}

export const chip = (page: Page, title: string, key: string) =>
  page.getByRole('link', { name: `${title}, tom ${key}`, exact: true });

// The Firebase SDK pins an "emulator mode" banner to the bottom of the page; it only exists in
// emulator builds and covers bottom-anchored controls (the FAB, the sheet), so tests hide it.
const hideEmulatorBanner = (): void => {
  const style = document.createElement('style');
  style.textContent = '.firebase-emulator-warning { display: none !important; }';
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
};

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(hideEmulatorBanner);
    await use(page);
  },
});

/**
 * A second, isolated browser session (own storage, so its own sign-in) with the same device and
 * locale settings as the running project. The caller closes `context`.
 */
export async function openSession(browser: Browser, testInfo: TestInfo) {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale } =
    testInfo.project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    locale,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.addInitScript(hideEmulatorBanner);
  return { context, page };
}

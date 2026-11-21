import type { Page } from '@playwright/test';
import { ADMIN, expect, signInAs, test } from './fixtures/app';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const CARD = { name: 'Cifras como app' };

type InstallWindow = Window & { __installPrompted?: number };

/**
 * Dispara um `beforeinstallprompt` sintético (o real não aparece no E2E). O `prompt` conta as chamadas
 * em `window.__installPrompted`.
 */
async function fireInstallPrompt(page: Page, outcome: 'accepted' | 'dismissed' = 'accepted') {
  await page.evaluate((choice) => {
    const w = window as InstallWindow;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: () => {
        w.__installPrompted = (w.__installPrompted ?? 0) + 1;
        return Promise.resolve();
      },
      userChoice: Promise.resolve({ outcome: choice, platform: 'web' }),
    });
    window.dispatchEvent(event);
  }, outcome);
}

test.describe('convite Cifras como app (Android/Chromium)', () => {
  test('o botão Adicionar abre o diálogo, e aceitar esconde o cartão', async ({ page }) => {
    await signInAs(page, ADMIN, 'Admin');
    const card = page.getByRole('region', CARD);
    await expect(card).toHaveCount(0);

    await fireInstallPrompt(page, 'accepted');
    await expect(card).toBeVisible();
    await expect(card.getByText('Abra direto da tela inicial')).toBeVisible();

    await card.getByRole('button', { name: 'Adicionar' }).click();
    expect(await page.evaluate(() => (window as InstallWindow).__installPrompted)).toBe(1);
    await expect(card).toHaveCount(0);
  });

  test('"Agora não" dispensa por 30 dias, mesmo depois de recarregar', async ({ page }) => {
    await signInAs(page, ADMIN, 'Admin');
    await fireInstallPrompt(page);
    const card = page.getByRole('region', CARD);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Agora não' }).click();
    await expect(card).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    // O evento volta a cada carga; o convite continua escondido pela dispensa gravada.
    await fireInstallPrompt(page);
    await expect(page.getByRole('region', CARD)).toHaveCount(0);
  });

  test('o app instalado (display-mode standalone) nunca mostra o convite', async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query: string) => {
        const mql = original(query);
        if (query !== '(display-mode: standalone)') return mql;
        return new Proxy(mql, {
          get(target, prop) {
            if (prop === 'matches') return true;
            const value = Reflect.get(target, prop, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      };
    });
    await signInAs(page, ADMIN, 'Admin');
    await fireInstallPrompt(page);
    await expect(page.getByRole('region', CARD)).toHaveCount(0);
  });

  test('fora da aba Músicas o convite não aparece', async ({ page }) => {
    await signInAs(page, ADMIN, 'Admin');
    await page.goto('/?aba=cantores');
    await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
    await fireInstallPrompt(page);
    await expect(page.getByRole('region', CARD)).toHaveCount(0);
  });
});

test.describe('convite Cifras como app (iPhone Safari)', () => {
  test.use({ userAgent: IPHONE_SAFARI });

  test('mostra a instrução de Compartilhar, sem botão', async ({ page }) => {
    await signInAs(page, ADMIN, 'Admin');
    const card = page.getByRole('region', CARD);
    await expect(card).toBeVisible();
    await expect(
      card.getByText('Toque em Compartilhar e depois em Adicionar à Tela de Início'),
    ).toBeVisible();
    await expect(card.getByRole('button', { name: 'Adicionar' })).toHaveCount(0);
  });
});

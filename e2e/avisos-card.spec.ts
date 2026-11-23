import type { Page } from '@playwright/test';
import {
  ADMIN,
  expect,
  registerVisitor,
  signInAs,
  signInToAccessScreen,
  test,
} from './fixtures/app';

const CARD = { name: 'Ative os avisos' };
const INSTALL_CARD = { name: 'Cifras como app' };
const DISMISS_KEY = 'cifras.avisosCard.v1';

/** Mesmo controle de `apps/web/src/push/fakeMessaging.ts`, definido antes de a página carregar. */
async function withPushFake(
  page: Page,
  control: {
    supported?: boolean;
    permission?: 'default' | 'granted' | 'denied';
    answer?: 'granted' | 'denied';
    failEnable?: boolean;
  },
) {
  await page.addInitScript((c) => {
    (window as unknown as { __CIFRAS_PUSH_FAKE__?: unknown }).__CIFRAS_PUSH_FAKE__ = c;
  }, control);
}

/** Abre como app instalado: `display-mode: standalone` verdadeiro (mesmo truque de `install.spec.ts`). */
async function asInstalledApp(page: Page) {
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
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Principal' });
const abrirMais = (page: Page) => nav(page).getByRole('link', { name: 'Mais' }).click();
const abrirMusicas = (page: Page) => nav(page).getByRole('link', { name: 'Músicas' }).click();

test.describe('card Ative os avisos (app instalado)', () => {
  test('Ativar some com o cartão, sem o cartão de instalar, dispara o teste e a aba Mais mostra Ativados', async ({
    page,
  }) => {
    await asInstalledApp(page);
    await withPushFake(page, { permission: 'default', answer: 'granted' });
    await signInAs(page, ADMIN, 'Admin');

    const card = page.getByRole('region', CARD);
    await expect(card).toBeVisible();
    await expect(page.getByRole('region', INSTALL_CARD)).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Ativar' })).toBeVisible();

    const sendTest = page.waitForRequest((r) => r.url().includes('sendTestPush'));
    await card.getByRole('button', { name: 'Ativar' }).click();
    await expect(card).toHaveCount(0);
    // Critério 3: sucesso dispara o aviso de teste, sem outro toque.
    await sendTest;

    await abrirMais(page);
    await expect(page.locator('li.push-row').getByText('Ativados', { exact: true })).toBeVisible();
  });

  test('"Agora não" dispensa e continua escondido depois de recarregar', async ({ page }) => {
    await asInstalledApp(page);
    await withPushFake(page, { permission: 'default', answer: 'granted' });
    await signInAs(page, ADMIN, 'Admin');

    const card = page.getByRole('region', CARD);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Agora não' }).click();
    await expect(card).toHaveCount(0);

    // Critério 5: chave própria e versionada, com data numérica da dispensa.
    const raw = await page.evaluate((key) => localStorage.getItem(key), DISMISS_KEY);
    expect(raw).not.toBeNull();
    expect(typeof JSON.parse(raw as string).dismissedAt).toBe('number');

    await page.reload();
    await expect(nav(page)).toBeVisible();
    await expect(page.getByRole('region', CARD)).toHaveCount(0);
  });

  test('permissão negada no diálogo: o cartão some e não volta depois de recarregar', async ({
    page,
  }) => {
    await asInstalledApp(page);
    await withPushFake(page, { permission: 'default', answer: 'denied' });
    await signInAs(page, ADMIN, 'Admin');

    const card = page.getByRole('region', CARD);
    await card.getByRole('button', { name: 'Ativar' }).click();
    await expect(card).toHaveCount(0);

    await page.reload();
    await expect(nav(page)).toBeVisible();
    await expect(page.getByRole('region', CARD)).toHaveCount(0);
  });

  test('erro ao ativar: o cartão some, sem mensagem nova no cartão', async ({ page }) => {
    await asInstalledApp(page);
    await withPushFake(page, { permission: 'default', answer: 'granted', failEnable: true });
    await signInAs(page, ADMIN, 'Admin');

    const card = page.getByRole('region', CARD);
    await card.getByRole('button', { name: 'Ativar' }).click();
    await expect(card).toHaveCount(0);
  });

  test('com avisos já ativos, o cartão não volta depois de recarregar', async ({ page }) => {
    await asInstalledApp(page);
    await withPushFake(page, { permission: 'default', answer: 'granted' });
    await signInAs(page, ADMIN, 'Admin');

    await page.getByRole('region', CARD).getByRole('button', { name: 'Ativar' }).click();
    await expect(page.getByRole('region', CARD)).toHaveCount(0);

    await page.reload();
    await expect(nav(page)).toBeVisible();
    await expect(page.getByRole('region', CARD)).toHaveCount(0);
  });

  test('permissão bloqueada antes de abrir: o cartão não aparece', async ({ page }) => {
    await asInstalledApp(page);
    await withPushFake(page, { permission: 'denied' });
    await signInAs(page, ADMIN, 'Admin');
    await expect(nav(page)).toBeVisible();
    await expect(page.getByRole('region', CARD)).toHaveCount(0);
  });

  test('sem suporte a notificações: o cartão não aparece', async ({ page }) => {
    await asInstalledApp(page);
    await withPushFake(page, { supported: false, permission: 'default' });
    await signInAs(page, ADMIN, 'Admin');
    await expect(nav(page)).toBeVisible();
    await expect(page.getByRole('region', CARD)).toHaveCount(0);
  });

  test('só na aba Músicas: some ao abrir a Mais e volta à Músicas', async ({ page }) => {
    await asInstalledApp(page);
    await withPushFake(page, { permission: 'default' });
    await signInAs(page, ADMIN, 'Admin');

    await expect(page.getByRole('region', CARD)).toBeVisible();
    await abrirMais(page);
    await expect(page.getByRole('region', CARD)).toHaveCount(0);
    await abrirMusicas(page);
    await expect(page.getByRole('region', CARD)).toBeVisible();
  });

  test('o botão Ativar e o "Agora não" têm alvo de pelo menos 44 px', async ({ page }) => {
    await asInstalledApp(page);
    await withPushFake(page, { permission: 'default', answer: 'granted' });
    await signInAs(page, ADMIN, 'Admin');

    const card = page.getByRole('region', CARD);
    await expect(card).toBeVisible();
    for (const name of ['Ativar', 'Agora não']) {
      const box = await card.getByRole('button', { name }).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  });
});

test('fora do app instalado (aba do navegador) o cartão não aparece', async ({ page }) => {
  await withPushFake(page, { permission: 'default' });
  await signInAs(page, ADMIN, 'Admin');
  await expect(nav(page)).toBeVisible();
  await expect(page.getByRole('region', CARD)).toHaveCount(0);
});

test('visitante no app instalado não vê o cartão (vê a tela de acesso)', async ({ page }) => {
  await asInstalledApp(page);
  await withPushFake(page, { permission: 'default' });
  const visitor = await registerVisitor('avisos-visitante');
  await signInToAccessScreen(page, visitor);
  await expect(page.getByRole('region', CARD)).toHaveCount(0);
});

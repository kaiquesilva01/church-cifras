import type { Page } from '@playwright/test';
import {
  ADMIN,
  expect,
  expectRole,
  newAccount,
  openSession,
  signInAs,
  signInWithPopup,
  test,
} from './fixtures/app';
import { createGoogleUser, waitForUserDoc } from './fixtures/emulator';
import { lettersTag } from './fixtures/names';

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';

const MUTED_AVAILABLE = 'Receba repertório novo e lembrete do ensaio neste aparelho';

/** Controle do fake de mensagens (`apps/web/src/push/fakeMessaging.ts`), antes de a página carregar. */
async function withPushFake(page: Page, control: Record<string, unknown>) {
  await page.addInitScript((c) => {
    (window as unknown as { __CIFRAS_PUSH_FAKE__?: unknown }).__CIFRAS_PUSH_FAKE__ = c;
  }, control);
}

async function abrirMais(page: Page) {
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Mais' })
    .click();
  await expect(page.locator('.role-badge')).toBeVisible();
}

const linhaAvisos = (page: Page) => page.locator('li.push-row');

test('membro vê "Avisos" antes de "Pessoas" na aba Mais', async ({ page, browser }, testInfo) => {
  const tag = lettersTag().toLowerCase();
  const person = { email: `avisos-${tag}@e2e.local`, name: `Avisos ${tag}` };
  await waitForUserDoc(await createGoogleUser(person.email, person.name));

  // O admin promove a pessoa a membro, como em people.spec.ts.
  await signInAs(page, ADMIN, 'Admin');
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Mais' })
    .click();
  await page.getByRole('link', { name: /Admin/ }).click();
  await expect(page.getByRole('heading', { name: 'Pessoas' })).toBeVisible();
  const select = page.getByLabel(`Papel de ${person.name}`);
  await select.selectOption({ label: 'Membro' });
  await expect(select).toHaveValue('member');

  // A pessoa entra em outra sessão isolada e vê a linha.
  const member = await openSession(browser, testInfo);
  try {
    await signInWithPopup(member.page, person);
    await expectRole(member.page, 'Membro');
    await abrirMais(member.page);

    await expect(linhaAvisos(member.page)).toBeVisible();
    await expect(
      linhaAvisos(member.page).getByRole('button', { name: 'Ativar avisos neste aparelho' }),
    ).toBeVisible();

    const avisosAntesDePessoas = await member.page.evaluate(() => {
      const row = document.querySelector('li.push-row');
      const pessoas = [...document.querySelectorAll('.menu-text strong')].find(
        (el) => el.textContent === 'Pessoas',
      );
      return (
        !!row &&
        !!pessoas &&
        (row.compareDocumentPosition(pessoas) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      );
    });
    expect(avisosAntesDePessoas).toBe(true);
  } finally {
    await member.context.close();
  }
});

test('visitante não vê "Avisos" na aba Mais', async ({ page }) => {
  await signInAs(page, newAccount('visitante-avisos'), 'Visitante');
  await abrirMais(page);

  await expect(linhaAvisos(page)).toHaveCount(0);
  await expect(page.getByText('Avisos', { exact: true })).toHaveCount(0);
});

test('ativar avisos mostra "Ativados" e permite o teste, com falha do envio em alerta', async ({
  page,
}) => {
  // Admin também pode ativar (canEdit): evita promover uma pessoa só para este caso.
  await withPushFake(page, { permission: 'default', answer: 'granted' });
  await signInAs(page, ADMIN, 'Admin');
  await abrirMais(page);

  await linhaAvisos(page).getByRole('button', { name: 'Ativar avisos neste aparelho' }).click();
  await expect(linhaAvisos(page).getByText('Ativados', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Enviar aviso de teste' }).click();
  // O emulador não tem FCM real: a Function sendTestPush pode levar alguns segundos para responder.
  await expect(
    page.getByRole('alert').filter({ hasText: 'Não foi possível enviar o teste.' }),
  ).toBeVisible({ timeout: 20_000 });
});

test('desativar avisos volta a linha para "Ativar" sem diálogo', async ({ page }) => {
  // Independente do caso anterior: ativa de novo antes de desativar.
  await withPushFake(page, { permission: 'default', answer: 'granted' });
  await signInAs(page, ADMIN, 'Admin');
  await abrirMais(page);

  await linhaAvisos(page).getByRole('button', { name: 'Ativar avisos neste aparelho' }).click();
  await expect(linhaAvisos(page).getByText('Ativados', { exact: true })).toBeVisible();

  let dialogs = 0;
  page.on('dialog', (dialog) => {
    dialogs += 1;
    void dialog.dismiss();
  });
  await linhaAvisos(page).getByRole('button', { name: 'Desativar avisos neste aparelho' }).click();

  await expect(linhaAvisos(page).getByText(MUTED_AVAILABLE)).toBeVisible();
  await expect(
    linhaAvisos(page).getByRole('button', { name: 'Ativar avisos neste aparelho' }),
  ).toBeVisible();
  expect(dialogs).toBe(0);
});

test('permissão bloqueada mostra o aviso e nenhum botão de ação', async ({ page }) => {
  await withPushFake(page, { permission: 'denied' });
  await signInAs(page, ADMIN, 'Admin');
  await abrirMais(page);

  await expect(
    linhaAvisos(page).getByText(
      'Bloqueados no navegador. Libere as notificações nas configurações do site e volte aqui',
    ),
  ).toBeVisible();
  await expect(linhaAvisos(page).getByRole('button')).toHaveCount(0);
});

test.describe('iPhone com Safari fora da tela inicial', () => {
  test.use({ userAgent: IPHONE_SAFARI_UA });

  test('orienta a instalar o app na tela inicial', async ({ page }) => {
    await signInAs(page, ADMIN, 'Admin');
    await abrirMais(page);

    await expect(
      linhaAvisos(page).getByText('Instale o app na tela inicial para receber avisos'),
    ).toBeVisible();
    await expect(
      linhaAvisos(page).getByText('No Safari: Compartilhar › Adicionar à Tela de Início', {
        exact: true,
      }),
    ).toBeVisible();
  });
});

test('navegador sem suporte mostra "Seu navegador não permite avisos"', async ({ page }) => {
  await withPushFake(page, { supported: false });
  await signInAs(page, ADMIN, 'Admin');
  await abrirMais(page);

  await expect(linhaAvisos(page).getByText('Seu navegador não permite avisos')).toBeVisible();
});

test('falha ao ativar mostra alerta e "Tentar de novo" recarrega a linha', async ({ page }) => {
  await withPushFake(page, { failEnable: true });
  await signInAs(page, ADMIN, 'Admin');
  await abrirMais(page);

  await linhaAvisos(page).getByRole('button', { name: 'Ativar avisos neste aparelho' }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Não foi possível ativar os avisos. Tente de novo.' }),
  ).toBeVisible();

  await linhaAvisos(page).getByRole('button', { name: 'Tentar de novo' }).click();
  // "Tentar de novo" recarrega a linha; não chama ativar. A linha volta a "Ativar".
  await expect(
    linhaAvisos(page).getByRole('button', { name: 'Ativar avisos neste aparelho' }),
  ).toBeVisible();
});

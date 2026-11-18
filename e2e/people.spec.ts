import { ADMIN, expect, expectRole, shot, signInAs, signInWithPopup, test } from './fixtures/app';
import { createGoogleUser, waitForUserDoc } from './fixtures/emulator';
import { lettersTag } from './fixtures/names';

test('admin promotes a visitor to member, who then gets "Nova cifra"', async ({
  page,
}, testInfo) => {
  const tag = lettersTag().toLowerCase();
  const person = { email: `pessoa-${tag}@e2e.local`, name: `Pessoa ${tag}` };
  await waitForUserDoc(await createGoogleUser(person.email, person.name));

  await signInAs(page, ADMIN, 'Admin');
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Mais' })
    .click();
  await page.getByRole('link', { name: /Admin/ }).click();
  await expect(page.getByRole('heading', { name: 'Pessoas' })).toBeVisible();
  const select = page.getByLabel(`Papel de ${person.name}`);
  await expect(select).toHaveValue('viewer');
  await shot(page, testInfo, 'people-1-list');

  await select.selectOption({ label: 'Membro' });
  await expect(page.getByRole('status').filter({ hasText: 'Papel atualizado' })).toBeVisible();
  await expect(select).toHaveValue('member');
  await shot(page, testInfo, 'people-2-promoted');

  // The person signs in and now sees the member controls.
  await page.getByRole('link', { name: /Voltar/ }).click();
  await page.getByRole('button', { name: /Sair/ }).click();
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
  await signInWithPopup(page, person);
  await expectRole(page, 'Membro');
  await expect(page.getByRole('link', { name: /Nova cifra/ })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Mais' })
    .click();
  await expect(page.getByRole('link', { name: /Admin/ })).toHaveCount(0);
});

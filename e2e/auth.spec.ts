import { ADMIN, expect, expectRole, shot, signInWithPopup, test } from './fixtures/app';

test('admin signs in through the emulator popup and signs out', async ({ page }, testInfo) => {
  await signInWithPopup(page, ADMIN);
  await expectRole(page, 'Admin');
  await shot(page, testInfo, 'auth-admin-home');

  // Mais: the Admin entry (people and roles) is there for admins, and so is Sair.
  await page
    .getByRole('navigation', { name: 'Principal' })
    .getByRole('link', { name: 'Mais' })
    .click();
  await expect(page.getByRole('link', { name: /Admin/ })).toBeVisible();
  await page.getByRole('button', { name: /Sair/ }).click();
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
});

test('the login screen warms the popup resolver iframe before the click', async ({ page }) => {
  await page.goto('/login');
  const iframe = page.locator('iframe[src*="auth/iframe"]');
  await expect(iframe).toBeAttached();
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
});

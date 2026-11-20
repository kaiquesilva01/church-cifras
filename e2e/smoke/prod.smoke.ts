import { expect, test } from '@playwright/test';

// Roda depois de cada deploy de produção (deploy.yml) e pode rodar à mão contra o site publicado.
// EXPECTED_VERSION é o SHA do commit publicado; sem ela, só confere que o site carrega sem erro.
test('o site está no ar e é a versão esperada', async ({ page }) => {
  if (!process.env.SMOKE_URL) throw new Error('SMOKE_URL é obrigatória');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Status de cada resposta da última carga de `/`: o JS principal precisa responder 200.
  const statuses = new Map<string, number>();
  page.on('response', (response) => statuses.set(response.url(), response.status()));

  const expected = process.env.EXPECTED_VERSION;
  if (expected) {
    // O Hosting pode levar alguns minutos para trocar a versão: recarrega até bater.
    await expect
      .poll(
        async () => {
          // Falha transitória do goto não encerra a espera: a próxima volta do poll tenta de novo.
          await page.goto('/').catch(() => {});
          return page.evaluate(
            () =>
              document.querySelector('meta[name="app-version"]')?.getAttribute('content') ?? null,
          );
        },
        { timeout: 180_000, intervals: [10_000] },
      )
      .toBe(expected);
  } else {
    await page.goto('/');
  }

  const src = await page.locator('script[type="module"][src]').first().getAttribute('src');
  expect(src, 'a página não carrega o script principal').toBeTruthy();
  expect(statuses.get(new URL(src!, page.url()).toString()), 'JS principal sem resposta 200').toBe(
    200,
  );

  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeVisible();
  expect(errors).toEqual([]);
});

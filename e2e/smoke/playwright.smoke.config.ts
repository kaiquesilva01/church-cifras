import { defineConfig, devices } from '@playwright/test';

// Checagem read-only do site já publicado (SMOKE_URL). Não sobe servidor nem emulador: roda depois do
// deploy, contra produção. Os specs usam *.smoke.ts, fora da suíte E2E (*.spec.ts).
export default defineConfig({
  testDir: '.',
  testMatch: '*.smoke.ts',
  outputDir: '../test-results/smoke',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.SMOKE_URL,
    locale: 'pt-BR',
    serviceWorkers: 'block',
  },
});

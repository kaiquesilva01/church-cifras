import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

// Run through the root `npm run test:e2e`: it starts the Firebase emulators (Auth 9099, Firestore 8080,
// Storage 9199, Functions 5001) and then this suite. The site is built against them (`--mode docker`
// loads apps/web/.env.docker, VITE_USE_EMULATORS=true) and served by `vite preview`, the same build
// that ships the service worker.
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: 'test-results',
  // Tests share one emulator (roles, the admin account): run them one at a time for stable results.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],
  use: {
    baseURL: BASE_URL,
    locale: 'pt-BR',
    trace: 'retain-on-failure',
    acceptDownloads: true,
    // The service worker is only exercised by pwa.spec.ts.
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `npx vite build --mode docker && npx vite preview --port ${PORT} --strictPort`,
    cwd: '../apps/web',
    url: BASE_URL,
    reuseExistingServer: !!process.env.E2E_REUSE_SERVER,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});

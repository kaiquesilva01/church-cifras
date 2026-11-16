import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['config/**/*.test.ts', 'rules/**/*.test.ts'],
    testTimeout: 20000,
    // Rules test files share one Firestore emulator and clear it in beforeEach.
    fileParallelism: false,
  },
});

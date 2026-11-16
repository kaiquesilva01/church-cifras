import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['config/**/*.test.ts', 'rules/**/*.test.ts'],
    testTimeout: 20000,
  },
});

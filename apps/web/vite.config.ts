import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Run afterEach hooks in registration order so the RTL cleanup in setup.ts unmounts before a
    // file's afterEach unstubs globals (ResizeObserver...). The default 'stack' order unstubbed first,
    // and a pending passive effect (PdfPages) could flush in between and throw under load.
    sequence: { hooks: 'list' },
  },
});

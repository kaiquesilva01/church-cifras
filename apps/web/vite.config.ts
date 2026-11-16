import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { preloadHints } from './build/preloadHints';
import { createPwaOptions, cacheEmulatorStorage } from './build/pwaConfig';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [
      react(),
      preloadHints(['bootstrap', 'firebase-core']),
      VitePWA(
        createPwaOptions(cacheEmulatorStorage(mode, env), env.VITE_EMULATOR_HOST || 'localhost'),
      ),
    ],
    build: {
      rolldownOptions: {
        output: {
          // Stable chunk names: the heavy libraries get long-lived cache entries and show up by name.
          codeSplitting: {
            groups: [
              { name: 'pdfjs', test: /node_modules\/pdfjs-dist\// },
              {
                name: 'overlay',
                test: /node_modules\/(pdf-lib|@pdf-lib)\/|packages\/overlay\/src\/(measure|fontkit|overlayWriter|rewriteWriter)\./,
              },
              {
                // Auth + Firestore (the app shell); Storage and Functions stay lazy.
                name: 'firebase-core',
                test: /node_modules\/(firebase\/(app|auth|firestore)|@firebase\/(app|auth|firestore|util|component|logger|webchannel-wrapper))\//,
              },
            ],
          },
        },
      },
    },
    server: {
      host: true,
      port: 5173,
      watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'build/**/*.test.ts'],
      // Run afterEach hooks in registration order so the RTL cleanup in setup.ts unmounts before a
      // file's afterEach unstubs globals (ResizeObserver...). The default 'stack' order unstubbed first,
      // and a pending passive effect (PdfPages) could flush in between and throw under load.
      sequence: { hooks: 'list' },
    },
  };
});

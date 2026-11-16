import type { VitePWAOptions } from 'vite-plugin-pwa';

const DAY = 24 * 60 * 60;

// Object downloads (`?alt=media`, also what getBlob requests) of song PDFs: the real bucket and the
// Storage emulator. The match starts at the origin (Workbox requires that for cross-origin patterns)
// and only covers `songs%2F...` objects: listings, uploads and other folders never match.
export const PDF_OBJECT_PATTERN =
  /^https?:\/\/(?:firebasestorage\.googleapis\.com|localhost:9199)\/v0\/b\/[^/]+\/o\/songs%2F/;
export const FONT_PATTERN = /\.ttf(?:\?.*)?$/;
// Lazy chunks, stylesheets and the pdf.js worker (all hashed files under /assets/).
export const CHUNK_PATTERN = /\/assets\/.+\.(?:m?js|css)(?:\?.*)?$/;

export const isPdfObjectRequest = (url: URL, method: string): boolean =>
  method === 'GET' && PDF_OBJECT_PATTERN.test(url.href);
export const isFontRequest = (url: URL): boolean => FONT_PATTERN.test(url.pathname);

export const PDF_CACHE = 'cifras-pdfs';

// Firestore, Functions and Auth are deliberately absent: no rule here ever matches them.
export const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'prompt',
  injectRegister: false,
  includeAssets: ['icons/*.{png,svg}'],
  manifest: {
    name: 'Cifras · Louvor',
    short_name: 'Cifras',
    description: 'Cifras do ministério de louvor: busca, transposição de tom e PDF.',
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#4f46e5',
    background_color: '#f2f2f4',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  workbox: {
    // App shell only: heavy and rarely used chunks are cached on first use (runtimeCaching below).
    globPatterns: ['index.html', 'assets/*.{js,css}'],
    globIgnores: [
      '**/assets/pdfjs-*',
      '**/assets/overlay-*',
      '**/assets/UploadRoute-*',
      '**/assets/ImportRoute-*',
      '**/assets/ViewerRoute-*',
      // Tiny modules that only export a font URL: the TTFs themselves are runtime cached.
      '**/assets/{Roboto,RobotoMono,LiberationSans,LiberationMono}-*.js',
      '**/assets/*.worker*',
      '**/assets/pdf.worker*',
    ],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/__\//],
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        urlPattern: PDF_OBJECT_PATTERN,
        method: 'GET',
        handler: 'CacheFirst',
        options: {
          cacheName: PDF_CACHE,
          expiration: { maxEntries: 200, maxAgeSeconds: 60 * DAY },
          cacheableResponse: { statuses: [200] },
        },
      },
      {
        urlPattern: FONT_PATTERN,
        method: 'GET',
        handler: 'CacheFirst',
        options: {
          cacheName: 'cifras-fonts',
          expiration: { maxEntries: 20, maxAgeSeconds: 365 * DAY },
          cacheableResponse: { statuses: [200] },
        },
      },
      {
        urlPattern: CHUNK_PATTERN,
        method: 'GET',
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'cifras-chunks',
          expiration: { maxEntries: 60, maxAgeSeconds: 30 * DAY },
          cacheableResponse: { statuses: [200] },
        },
      },
    ],
  },
};

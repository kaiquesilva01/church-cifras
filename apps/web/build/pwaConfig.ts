import type { VitePWAOptions } from 'vite-plugin-pwa';

const DAY = 24 * 60 * 60;

// Media downloads (`?alt=media`, also what getBlob requests) of song PDFs from the real bucket. The
// match starts at the origin (Workbox requires that for cross-origin patterns) and only covers
// `songs%2F...` objects: listings, metadata calls, uploads and other folders never match. The Storage
// emulator host is accepted only in builds meant for local development.
export const pdfObjectPattern = (includeEmulator: boolean): RegExp =>
  includeEmulator
    ? /^https?:\/\/(?:firebasestorage\.googleapis\.com|localhost:9199)\/v0\/b\/[^/]+\/o\/songs%2F[^?]*\?(?:[^#]*&)?alt=media(?:&|#|$)/
    : /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/songs%2F[^?]*\?(?:[^#]*&)?alt=media(?:&|#|$)/;
export const FONT_PATTERN = /\.ttf(?:\?.*)?$/;
// Lazy chunks, stylesheets and the pdf.js worker (all hashed files under /assets/).
export const CHUNK_PATTERN = /\/assets\/.+\.(?:m?js|css)(?:\?.*)?$/;

export const isPdfObjectRequest = (url: URL, method: string, includeEmulator = false): boolean =>
  method === 'GET' && pdfObjectPattern(includeEmulator).test(url.href);
export const isFontRequest = (url: URL): boolean => FONT_PATTERN.test(url.pathname);

export const PDF_CACHE = 'cifras-pdfs';

// Firestore, Functions and Auth are deliberately absent: no rule here ever matches them.
export const createPwaOptions = (includeEmulator: boolean): Partial<VitePWAOptions> => ({
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
        urlPattern: pdfObjectPattern(includeEmulator),
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
});

/** Production builds never cache the Storage emulator; dev and emulator builds do. */
export const cacheEmulatorStorage = (
  mode: string,
  env: Record<string, string | undefined>,
): boolean => mode !== 'production' || env.VITE_USE_EMULATORS === 'true';

export const pwaOptions = createPwaOptions(false);

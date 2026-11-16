import type { VitePWAOptions } from 'vite-plugin-pwa';

const DAY = 24 * 60 * 60;

// Media downloads (`?alt=media`, also what getBlob requests) of song PDFs from the real bucket. The
// match starts at the origin (Workbox requires that for cross-origin patterns) and only covers
// `songs%2F...` objects: listings, metadata calls, uploads and other folders never match. The Storage
// emulator host is accepted only in builds meant for local development.
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OBJECT_PATH = String.raw`\/v0\/b\/[^/]+\/o\/songs%2F[^?]*\?(?:[^#]*&)?alt=media(?:&|#|$)`;

export const pdfObjectPattern = (includeEmulator: boolean, emulatorHost = 'localhost'): RegExp =>
  new RegExp(
    includeEmulator
      ? String.raw`^https?:\/\/(?:firebasestorage\.googleapis\.com|${escapeRegExp(emulatorHost)}:9199)` +
          OBJECT_PATH
      : String.raw`^https:\/\/firebasestorage\.googleapis\.com` + OBJECT_PATH,
  );
export const FONT_PATTERN = /\.ttf(?:\?.*)?$/;
// Lazy chunks, stylesheets and the pdf.js worker (all hashed files under /assets/).
export const CHUNK_PATTERN = /\/assets\/.+\.(?:m?js|css)(?:\?.*)?$/;

export const isPdfObjectRequest = (
  url: URL,
  method: string,
  includeEmulator = false,
  emulatorHost = 'localhost',
): boolean => method === 'GET' && pdfObjectPattern(includeEmulator, emulatorHost).test(url.href);
export const isFontRequest = (url: URL): boolean => FONT_PATTERN.test(url.pathname);

export const PDF_CACHE = 'cifras-pdfs';

// Firestore, Functions and Auth are deliberately absent: no rule here ever matches them.
// Serialized into the service worker by Workbox: must not reference anything outside its own body.
// A missing chunk answered with the SPA fallback (HTML, status 200) must never be cached as JS/CSS.
export const rejectHtmlResponse = ({
  response,
}: {
  response: Response;
}): Promise<Response | null> =>
  Promise.resolve(
    (response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')
      ? null
      : response,
  );

export const createPwaOptions = (
  includeEmulator: boolean,
  emulatorHost = 'localhost',
): Partial<VitePWAOptions> => ({
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
        urlPattern: pdfObjectPattern(includeEmulator, emulatorHost),
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
          plugins: [{ cacheWillUpdate: rejectHtmlResponse }],
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

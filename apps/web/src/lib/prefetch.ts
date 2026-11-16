const SONG_PATH = /^\/musicas\/[^/]+/;

/** Viewer route module (pulls in pdf.js); overlay stays out, it loads only when a key is changed. */
export const loadViewerRoute = () => import('../viewer/ViewerRoute');

/**
 * Deep link to a song: download the viewer chunks right away, in parallel with the Firebase Auth
 * restore, instead of waiting for the auth gate to mount the lazy route.
 */
export function prefetchForPath(
  pathname: string,
  loadViewer: () => Promise<unknown> = loadViewerRoute,
): void {
  if (!SONG_PATH.test(pathname)) return;
  // Best effort: a failure is reported by React.lazy when the route mounts.
  loadViewer().catch(() => undefined);
}

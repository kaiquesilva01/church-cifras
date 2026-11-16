import { useEffect, type MutableRefObject } from 'react';
import type { CatalogApi } from '../catalog/catalogApi';
import type { SetlistItem } from '../setlists/types';
import type { DocCache } from './docCache';
import type { PdfDocument } from './PdfPages';

interface Params {
  api: CatalogApi;
  openPdf: (bytes: Uint8Array) => Promise<PdfDocument>;
  docCache: DocCache;
  alive: MutableRefObject<boolean>;
  shownPath: MutableRefObject<string | null>;
  /** Só depois de a cifra atual estar na tela: o pré-carregamento nunca atrasa a abertura dela. */
  enabled: boolean;
  next: SetlistItem | null;
  onLoaded: () => void;
}

/** Baixa e abre o PDF do próximo item do repertório para a troca ser rápida. Falhas são silenciosas. */
export function useNextPreload({
  api,
  openPdf,
  docCache,
  alive,
  shownPath,
  enabled,
  next,
  onLoaded,
}: Params): void {
  const songId = next?.songId;
  const key = next?.key;
  useEffect(() => {
    if (!enabled || !songId || !key) return;
    let cancelled = false;
    void (async () => {
      const arrangement = await api.getArrangement(songId, key);
      if (cancelled || !arrangement || docCache.peek(arrangement.storagePath)) return;
      const bytes = await api.getPdfBytes(arrangement.storagePath);
      const doc = await openPdf(bytes.slice());
      if (!alive.current) return void doc.destroy?.();
      docCache.set(arrangement.storagePath, { doc, bytes }, shownPath.current ?? undefined);
      onLoaded();
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, openPdf, docCache, alive, shownPath, enabled, songId, key, onLoaded]);
}

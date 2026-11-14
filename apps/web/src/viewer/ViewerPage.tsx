import { keyFromSlug } from '@cifras/chords';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { CatalogApi } from '../catalog/catalogApi';
import { useSongsContext } from '../catalog/SongsProvider';
import { KeyChips } from '../search/KeyChips';
import { pdfFileName } from './fileName';
import { PdfPages, type PdfDocument } from './PdfPages';
import { useSongArrangements } from './useSongArrangements';

type Loaded = { status: 'ready'; doc: PdfDocument; bytes: Uint8Array } | { status: 'error' };

export interface ViewerPageProps {
  api: CatalogApi;
  songId: string;
  /** `?tom` slug of the open key, if any. */
  tomSlug: string | null;
  /** Opens the PDF bytes (pdf.js lives in the lazy route, not here). */
  openPdf: (bytes: Uint8Array) => Promise<PdfDocument>;
}

const NO_OVERLAYS: never[] = [];

export function ViewerPage({ api, songId, tomSlug, openPdf }: ViewerPageProps) {
  const { status, songs } = useSongsContext();
  const song = songs.find((s) => s.id === songId);
  const { status: arrStatus, arrangements } = useSongArrangements(api, song ? song.id : null);

  const selected = useMemo(() => {
    const fromUrl = keyFromSlug(tomSlug ?? '');
    return (
      arrangements.find((a) => a.key === fromUrl) ??
      arrangements.find((a) => a.source === 'handmade') ??
      arrangements[0] ??
      null
    );
  }, [arrangements, tomSlug]);

  const path = selected?.storagePath ?? null;
  const [previewFailed, setPreviewFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ path: string; result: Loaded } | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let opened: PdfDocument | null = null;
    api
      .getPdfBytes(path)
      // pdf.js transfers the buffer to its worker: keep the original for the download.
      .then(async (bytes) => ({ bytes, doc: await openPdf(bytes.slice()) }))
      .then(({ bytes, doc }) => {
        if (cancelled) return void doc.destroy?.();
        opened = doc;
        setLoaded({ path, result: { status: 'ready', doc, bytes } });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ path, result: { status: 'error' } });
      });
    return () => {
      cancelled = true;
      void opened?.destroy?.();
    };
  }, [api, openPdf, path]);

  if (status === 'loading') {
    return (
      <p role="status" className="status">
        Carregando cifra…
      </p>
    );
  }
  if (!song) {
    return status === 'error' ? (
      <p role="alert" className="error">
        Não foi possível carregar as cifras.
      </p>
    ) : (
      <p className="status">
        Música não encontrada. <Link to="/">Voltar</Link>
      </p>
    );
  }

  const current = loaded && loaded.path === path ? loaded.result : null;
  const download = (): void => {
    if (current?.status !== 'ready' || !selected) return;
    const url = URL.createObjectURL(
      new Blob([current.bytes as BlobPart], { type: 'application/pdf' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = pdfFileName(song.title, song.artistName, selected.key);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <section className="viewer">
      <header className="viewer-head">
        <Link to="/" className="back">
          <span aria-hidden="true">‹ </span>
          {song.title}
        </Link>
        <p className="muted">{song.artistName}</p>
        <KeyChips
          songId={song.id}
          title={song.title}
          keys={arrangements.length > 0 ? arrangements.map((a) => a.key) : song.keys}
          selected={selected?.key}
          replace
        />
      </header>
      {arrStatus === 'error' || current?.status === 'error' ? (
        <p role="alert" className="error">
          Não foi possível abrir o PDF.
        </p>
      ) : arrStatus === 'ready' && !selected ? (
        <p className="status">Esta música ainda não tem PDF.</p>
      ) : current?.status === 'ready' ? (
        <>
          {previewFailed === path && (
            <p role="alert" className="error">
              Não foi possível mostrar a prévia.
            </p>
          )}
          <PdfPages
            doc={current.doc}
            overlays={NO_OVERLAYS}
            onPreviewError={() => setPreviewFailed(path)}
          />
        </>
      ) : (
        <p role="status" className="status">
          Carregando cifra…
        </p>
      )}
      <div className="viewer-bar">
        <button
          type="button"
          className="btn"
          onClick={download}
          disabled={current?.status !== 'ready'}
        >
          ⬇ PDF
        </button>
      </div>
    </section>
  );
}

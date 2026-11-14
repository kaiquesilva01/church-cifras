import { chooseFont, createOverlayWriter, createRewriteWriter, loadFonts } from '@cifras/overlay';
import type { ChordWriter, FontBytesLoader, FontId, LoadedFonts } from '@cifras/overlay';
import { keyFromSlug, keySlug, parseKey, type TextLine } from '@cifras/chords';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { canEdit } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import type { CatalogApi } from '../catalog/catalogApi';
import { useSongsContext } from '../catalog/SongsProvider';
import { KeyChips } from '../search/KeyChips';
import { pdfFileName } from './fileName';
import { KeyPanel } from './KeyPanel';
import { loadFontBytes } from './loadFonts';
import { PdfPages, type PdfDocument } from './PdfPages';
import { saveGenerated } from './saveGenerated';
import { pickTransposeSource } from './transposeSource';
import { useSongArrangements } from './useSongArrangements';
import { useTranspose } from './useTranspose';

type Loaded = { status: 'ready'; doc: PdfDocument; bytes: Uint8Array } | { status: 'error' };

interface MediaQueryLike {
  matches: boolean;
  addEventListener(type: 'change', listener: () => void): void;
  removeEventListener(type: 'change', listener: () => void): void;
}

export interface ViewerPageProps {
  api: CatalogApi;
  songId: string;
  /** `?tom` slug of the open key, if any. */
  tomSlug: string | null;
  /** Opens the PDF bytes (pdf.js lives in the lazy route, not here). */
  openPdf: (bytes: Uint8Array) => Promise<PdfDocument>;
  /** Reads the text lines of an open document (pdf.js side, injected by the route). */
  readLines: (doc: PdfDocument) => Promise<TextLine[]>;
  loadFont?: FontBytesLoader;
  /** `VITE_CHORD_WRITER`: `rewrite` is a skeleton that cannot save yet. */
  writerMode?: 'overlay' | 'rewrite';
  writer?: ChordWriter;
  matchMedia?: (query: string) => MediaQueryLike;
}

const NO_OVERLAYS: never[] = [];
const WIDE_QUERY = '(min-width: 900px)';
const BOLD_FONT = /bold|black|heavy/i;

const defaultMode = (): 'overlay' | 'rewrite' =>
  import.meta.env.VITE_CHORD_WRITER === 'rewrite' ? 'rewrite' : 'overlay';

// Side panel from 900px wide up; a bottom sheet below.
function useWide(matchMedia?: ViewerPageProps['matchMedia']): boolean {
  const query =
    matchMedia ?? (typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : null);
  const [wide, setWide] = useState(() => query?.(WIDE_QUERY).matches ?? false);
  useEffect(() => {
    if (!query) return;
    const list = query(WIDE_QUERY);
    const update = (): void => setWide(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return wide;
}

// Only the substitute fonts this pdf's text will be measured and drawn with.
function neededFonts(lines: TextLine[]): FontId[] {
  const ids = new Set<FontId>();
  for (const line of lines) {
    for (const run of line.runs) {
      ids.add(chooseFont(run.fontName, BOLD_FONT.test(run.fontName)));
      ids.add(chooseFont(run.fontName, run.bold));
    }
  }
  return [...ids];
}

type Prepared =
  | { doc: PdfDocument; status: 'ready'; lines: TextLine[]; fonts: LoadedFonts }
  | { doc: PdfDocument; status: 'error' };

export function ViewerPage({
  api,
  songId,
  tomSlug,
  openPdf,
  readLines,
  loadFont = loadFontBytes,
  writerMode = defaultMode(),
  writer,
  matchMedia,
}: ViewerPageProps) {
  const { status, songs } = useSongsContext();
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const song = songs.find((s) => s.id === songId);
  const { status: arrStatus, arrangements } = useSongArrangements(api, song ? song.id : null);
  const wide = useWide(matchMedia);

  const selected = useMemo(() => {
    const fromUrl = keyFromSlug(tomSlug ?? '');
    return (
      arrangements.find((a) => a.key === fromUrl) ??
      arrangements.find((a) => a.source === 'handmade') ??
      arrangements[0] ??
      null
    );
  }, [arrangements, tomSlug]);

  const source = useMemo(
    () => pickTransposeSource(arrangements, selected?.key ?? null),
    [arrangements, selected],
  );
  const [panelOpen, setPanelOpen] = useState(false);
  // The preview is painted over the transpose source, so that is what shows while the panel is open.
  const displayed = panelOpen && source ? source : selected;

  const path = displayed?.storagePath ?? null;
  const [previewFailed, setPreviewFailed] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ path: string; result: Loaded } | null>(null);
  const onPreviewError = useCallback(() => setPreviewFailed(path), [path]);

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

  const current = loaded && loaded.path === path ? loaded.result : null;
  const readyDoc = current?.status === 'ready' ? current.doc : null;

  // Panel open: read the source's chords and load the fonts they need (once per document).
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  useEffect(() => {
    if (!panelOpen || !readyDoc || prepared?.doc === readyDoc) return;
    let cancelled = false;
    readLines(readyDoc)
      .then(async (lines) => ({ lines, fonts: await loadFonts(loadFont, neededFonts(lines)) }))
      .then(({ lines, fonts }) => {
        if (!cancelled) setPrepared({ doc: readyDoc, status: 'ready', lines, fonts });
      })
      .catch(() => {
        if (!cancelled) setPrepared({ doc: readyDoc, status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [panelOpen, readyDoc, prepared, readLines, loadFont]);

  const ready = prepared?.doc === readyDoc && prepared?.status === 'ready' ? prepared : null;
  const sourceKey = useMemo(() => (source ? parseKey(source.key) : null), [source]);
  const { target, setTarget, plan, ops, collisions, suspects } = useTranspose({
    sourceLines: ready?.lines ?? null,
    sourceKey,
    fonts: ready?.fonts ?? null,
  });

  const [busy, setBusy] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const chordWriter = useMemo(
    () =>
      writer ?? (writerMode === 'rewrite' ? createRewriteWriter() : createOverlayWriter(loadFont)),
    [writer, writerMode, loadFont],
  );

  const closePanel = (): void => {
    setPanelOpen(false);
    setTarget(null);
    setGenerateError(null);
  };
  const open = (key: string): void => {
    navigate(`/musicas/${songId}?tom=${keySlug(key)}`, { replace: true });
  };

  const confirm = async (): Promise<void> => {
    if (!target || !source) return;
    if (arrangements.some((a) => a.key === target)) {
      open(target);
      closePanel();
      return;
    }
    if (writerMode === 'rewrite' || !plan || current?.status !== 'ready' || !user) return;
    setBusy(true);
    setGenerateError(null);
    try {
      const bytes = await chordWriter.write(current.bytes, plan);
      const saved = await saveGenerated(api, {
        songId,
        key: target,
        bytes,
        derivedFromKey: source.key,
        chordCount: plan.chordCount,
        collisions,
        uid: user.uid,
      });
      setNotice(
        saved.status === 'existing' ? 'Esse tom já tinha sido salvo. Abrimos o existente.' : null,
      );
      open(saved.key);
      closePanel();
    } catch {
      setGenerateError('Não foi possível gerar o PDF. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

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

  const download = (): void => {
    if (current?.status !== 'ready' || !displayed) return;
    const url = URL.createObjectURL(
      new Blob([current.bytes as BlobPart], { type: 'application/pdf' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = pdfFileName(song.title, song.artistName, displayed.key);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const canChange = canEdit(role);
  const preparing = prepared?.doc === readyDoc && prepared?.status === 'error' ? false : !ready;
  const prepareError =
    prepared?.doc === readyDoc && prepared?.status === 'error'
      ? 'Não foi possível preparar a troca de tom.'
      : null;
  const savedKeys = arrangements.map((a) => a.key);

  return (
    <section className={`viewer${panelOpen && wide ? ' has-side' : ''}`}>
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
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
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
            overlays={panelOpen ? ops : NO_OVERLAYS}
            onPreviewError={onPreviewError}
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
        {canChange && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!source}
            aria-describedby={!source ? 'no-source' : undefined}
            onClick={() => {
              setNotice(null);
              setPanelOpen(true);
            }}
          >
            ♪ Mudar tom
          </button>
        )}
        {canChange && arrStatus === 'ready' && !source && (
          <p id="no-source" className="muted">
            Não há PDF feito à mão para transpor.
          </p>
        )}
      </div>
      {panelOpen && source && (
        <KeyPanel
          sourceKey={source.key}
          savedKeys={savedKeys}
          target={target}
          onTarget={setTarget}
          onCancel={closePanel}
          onConfirm={() => void confirm()}
          collisions={collisions}
          suspects={suspects}
          busy={busy}
          layout={wide ? 'side' : 'sheet'}
          preparing={preparing}
          error={generateError ?? prepareError}
          unavailable={writerMode === 'rewrite'}
        />
      )}
    </section>
  );
}

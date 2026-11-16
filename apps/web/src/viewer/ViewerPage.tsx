import { chooseFont, type FontBytesLoader, type FontId } from '@cifras/overlay/ops';
import type { ChordWriter } from '@cifras/overlay';
import {
  keyFromSlug,
  keySlug,
  parseKey,
  type KeyName,
  type Measure,
  type TextLine,
} from '@cifras/chords';
import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { canEdit, isAdmin } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import type { CatalogApi } from '../catalog/catalogApi';
import { deriveArtists } from '../catalog/search';
import { useSongsContext } from '../catalog/SongsProvider';
import { KeyChips } from '../search/KeyChips';
import { pdfFileName } from './fileName';
import { ConfirmDialog } from './ConfirmDialog';
import { EditSongDialog } from './EditSongDialog';
import { KeyPanel } from './KeyPanel';
import { loadFontBytes } from './loadFonts';
import { ManageMenu, type ManageAction } from './ManageMenu';
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

interface ManageState {
  action: ManageAction;
  /** Key captured when the delete-key dialog opened; it does not follow the URL. */
  key: KeyName | null;
  busy: boolean;
  error: string | null;
}

const errorCode = (error: unknown): string =>
  String((error as { code?: unknown } | null)?.code ?? '').replace(/^functions\//, '');

const defaultMode = (): 'overlay' | 'rewrite' =>
  import.meta.env.VITE_CHORD_WRITER === 'rewrite' ? 'rewrite' : 'overlay';

// pdf-lib and fontkit stay out of the initial bundle: they load when the panel prepares or confirms.
const loadOverlay = () => import('@cifras/overlay');

// Side panel from 900px wide up; a bottom sheet below.
function useWide(matchMedia?: ViewerPageProps['matchMedia']): boolean {
  // Memoized: a new bound function every render would resubscribe the listener every render.
  const query = useMemo(
    () =>
      matchMedia ??
      (typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : null),
    [matchMedia],
  );
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
  | { doc: PdfDocument; status: 'ready'; lines: TextLine[]; measure: Measure }
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
  const artistNames = useMemo(() => deriveArtists(songs).map((a) => a.name), [songs]);
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
      // The document is destroyed: coming back to this path must reload, not show it.
      setLoaded((prev) => (prev?.path === path ? null : prev));
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
      .then(async (lines) => {
        const { createMeasure, loadFonts } = await loadOverlay();
        const fonts = await loadFonts(loadFont, neededFonts(lines));
        return { lines, measure: createMeasure(fonts) };
      })
      .then(({ lines, measure }) => {
        if (!cancelled) setPrepared({ doc: readyDoc, status: 'ready', lines, measure });
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
    measure: ready?.measure ?? null,
  });

  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ key: string } | null>(null);
  const [manage, setManage] = useState<ManageState | null>(null);
  const [metaSaved, setMetaSaved] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // The key being deleted vanished (removed elsewhere): nothing left to confirm.
  const targetKey = manage?.action === 'delete-key' && !manage.busy ? manage.key : null;
  if (targetKey && arrStatus === 'ready' && !arrangements.some((a) => a.key === targetKey)) {
    setManage(null);
  }
  const chordWriter = useMemo<ChordWriter>(
    () =>
      writer ?? {
        async write(bytes, plan) {
          const overlay = await loadOverlay();
          const real =
            writerMode === 'rewrite'
              ? overlay.createRewriteWriter()
              : overlay.createOverlayWriter(loadFont);
          return real.write(bytes, plan);
        },
      },
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
      setNotice(saved.status === 'existing' ? { key: saved.key } : null);
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

  const admin = isAdmin(role);
  // The Mudar tom panel and the manage menu/dialogs are never open together.
  const managing = menuOpen || manage !== null;
  const closeManage = (): void => setManage(null);
  const startManage = (action: ManageAction): void => {
    setMetaSaved(false);
    setManage({
      action,
      key: action === 'delete-key' ? (selected?.key ?? null) : null,
      busy: false,
      error: null,
    });
  };
  const fail = (action: ManageAction, error: unknown, fallback: string): void =>
    setManage((prev) => ({
      action,
      key: prev?.key ?? null,
      busy: false,
      error:
        errorCode(error) === 'failed-precondition' && error instanceof Error
          ? error.message
          : fallback,
    }));

  const saveMeta = async (value: { title: string; artistName: string }): Promise<void> => {
    if (value.title === song.title && value.artistName === song.artistName) {
      setManage(null);
      return;
    }
    setManage({ action: 'edit', key: null, busy: true, error: null });
    try {
      await api.updateSongMeta(songId, value);
      setManage(null);
      setMetaSaved(true);
    } catch (error) {
      setManage({
        action: 'edit',
        key: null,
        busy: false,
        error:
          errorCode(error) === 'already-exists'
            ? 'Já existe uma música com esse nome e cantor.'
            : 'Não foi possível salvar. Tente de novo.',
      });
    }
  };

  const deleteKey = async (): Promise<void> => {
    const removed = manage?.key;
    if (manage?.action !== 'delete-key' || !removed) return;
    setManage({ action: 'delete-key', key: removed, busy: true, error: null });
    const leave = (): void => {
      const next = arrangements.find((a) => a.key !== removed);
      setManage(null);
      navigate(next ? `/musicas/${songId}?tom=${keySlug(next.key)}` : '/', { replace: true });
    };
    try {
      await api.deleteArrangement(songId, removed);
      leave();
    } catch (error) {
      // Already gone (another admin got there first): same outcome as success.
      if (errorCode(error) === 'not-found') leave();
      else fail('delete-key', error, 'Não foi possível apagar o tom. Tente de novo.');
    }
  };

  const deleteWholeSong = async (): Promise<void> => {
    setManage({ action: 'delete-song', key: null, busy: true, error: null });
    try {
      await api.deleteSong(songId);
      navigate('/', { state: { notice: 'Música apagada.' } });
    } catch (error) {
      fail('delete-song', error, 'Não foi possível apagar a música. Tente de novo.');
    }
  };

  const canChange = canEdit(role);
  const prepareFailed =
    current?.status === 'error' || (prepared?.doc === readyDoc && prepared?.status === 'error');
  const prepareError = prepareFailed ? 'Não foi possível preparar a troca de tom.' : null;
  const preparing = !prepareFailed && !ready;
  const savedKeys = arrangements.map((a) => a.key);

  return (
    <section
      className={`viewer${panelOpen && wide ? ' has-side' : ''}${sheetHeight !== null ? ' has-sheet' : ''}`}
      style={
        sheetHeight !== null
          ? ({ '--sheet-height': `${sheetHeight}px` } as CSSProperties)
          : undefined
      }
    >
      <div className="viewer-body" inert={panelOpen && !wide}>
        <header className="viewer-head">
          <Link to="/" className="back">
            <span aria-hidden="true">‹ </span>
            {song.title}
          </Link>
          <p className="muted">{song.artistName}</p>
          {admin && (
            <ManageMenu
              keyName={selected?.key ?? null}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              disabled={panelOpen}
              onSelect={startManage}
            />
          )}
          <KeyChips
            songId={song.id}
            title={song.title}
            keys={arrangements.length > 0 ? arrangements.map((a) => a.key) : song.keys}
            selected={selected?.key}
            replace
          />
        </header>
        {metaSaved && (
          <p role="status" className="notice">
            Dados atualizados.
          </p>
        )}
        {notice && notice.key === keyFromSlug(tomSlug ?? '') && (
          <p role="status" className="notice">
            Esse tom já tinha sido salvo. Abrimos o existente.
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
            <span aria-hidden="true">⬇ </span>PDF
          </button>
          {canChange && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!source || managing}
              aria-describedby={!source ? 'no-source' : undefined}
              onClick={() => {
                if (managing) return;
                setNotice(null);
                setPanelOpen(true);
              }}
            >
              <span aria-hidden="true">♪ </span>Mudar tom
            </button>
          )}
          {canChange && arrStatus === 'ready' && !source && (
            <p id="no-source" className="muted">
              Não há PDF feito à mão para transpor.
            </p>
          )}
        </div>
      </div>
      {manage?.action === 'edit' && (
        <EditSongDialog
          title={song.title}
          artistName={song.artistName}
          busy={manage.busy}
          error={manage.error}
          artists={artistNames}
          onSave={(value) => void saveMeta(value)}
          onCancel={closeManage}
        />
      )}
      {manage?.action === 'delete-key' && manage.key && (
        <ConfirmDialog
          title={`Apagar tom ${manage.key}`}
          confirmLabel="Apagar tom"
          busy={manage.busy}
          error={manage.error}
          onConfirm={() => void deleteKey()}
          onCancel={closeManage}
        >
          {`Apagar o tom ${manage.key} de “${song.title}”? O PDF será removido.`}
        </ConfirmDialog>
      )}
      {manage?.action === 'delete-song' && (
        <ConfirmDialog
          title="Apagar música"
          confirmLabel="Apagar música"
          requireText={song.title}
          busy={manage.busy}
          error={manage.error}
          onConfirm={() => void deleteWholeSong()}
          onCancel={closeManage}
        >
          {`Isto apaga “${song.title}” e todos os tons, com os PDFs. Não dá para desfazer.`}
        </ConfirmDialog>
      )}
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
          onSheetHeight={setSheetHeight}
          preparing={preparing}
          error={generateError ?? prepareError}
          unavailable={writerMode === 'rewrite'}
        />
      )}
    </section>
  );
}

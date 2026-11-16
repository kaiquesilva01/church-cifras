import { parseKey } from '@cifras/chords';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ArrangementExistsError, saveUpload, type CatalogApi } from '../catalog/catalogApi';
import { deriveArtists } from '../catalog/search';
import { MAX_TEXT } from '../catalog/songText';
import { useSongsContext } from '../catalog/SongsProvider';
import type { SongSummary, UploadPlan } from '../catalog/types';
import type { ReadPdf } from '../upload/UploadPage';
import { MAX_BYTES } from '../upload/limits';
import {
  classifyRows,
  identityOf,
  isImportable,
  planImport,
  sourceFromSummary,
  type BatchRow,
  type ClassifiedRow,
} from './batch';
import { ImportRow } from './ImportRow';
import { toCsv } from './csv';
import { filesFromDrop, isPdf, runPool } from './readFiles';
import { runImport, type RowResult } from './queue';

const DEBOUNCE_MS = 300;
const READ_CONCURRENCY = 2;

type Classified = {
  /** The row objects that were classified: an edited row is a new object. */
  source: ReadonlyMap<string, BatchRow>;
  index: ReadonlyMap<string, SongSummary> | null;
  list: ClassifiedRow[];
  byId: ReadonlyMap<string, ClassifiedRow>;
};
type Progress = { done: number; total: number };

function downloadCsv(text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'relatorio-importacao.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ImportPage({ api, readPdf }: { api: CatalogApi; readPdf: ReadPdf }) {
  const { songs } = useSongsContext();
  const index = useMemo(() => {
    const map = new Map<string, SongSummary>();
    for (const song of songs) map.set(`${song.titleNormalized}|${song.artistId}`, song);
    return map;
  }, [songs]);
  const catalogArtists = useMemo(() => deriveArtists(songs).map((a) => a.name), [songs]);

  const [rows, setRows] = useState<BatchRow[]>([]);
  const [classified, setClassified] = useState<Classified>({
    source: new Map(),
    index: null,
    list: [],
    byId: new Map(),
  });
  const [reading, setReading] = useState<Progress | null>(null);
  const [nonPdf, setNonPdf] = useState(0);
  const [importing, setImporting] = useState<Progress | null>(null);
  const [results, setResults] = useState<Map<string, RowResult> | undefined>(undefined);
  const [queued, setQueued] = useState<ReadonlySet<string>>(new Set());
  const [cancelled, setCancelled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [frozenReady, setFrozenReady] = useState(0);
  const [dragging, setDragging] = useState(false);

  const nextId = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const rowsRef = useRef(rows);
  const artistsRef = useRef(catalogArtists);
  const busyRef = useRef(false);
  const importingNow = importing !== null;
  useEffect(() => {
    rowsRef.current = rows;
    artistsRef.current = catalogArtists;
  }, [rows, catalogArtists]);

  // Classification is synchronous (the catalog summaries carry the key sources); only the
  // debounce is async. Paused while importing: the catalog changes under us and results
  // are tracked per row. The race with other admins is settled by the worker (it handles
  // ArrangementExistsError and the replace precondition).
  useEffect(() => {
    if (importingNow) return;
    const timer = setTimeout(() => {
      const byId = new Map(songs.map((song) => [song.id, song]));
      const list = classifyRows(rows, {
        findSong: (titleNormalized, artistId) =>
          index.get(`${titleNormalized}|${artistId}`) ?? null,
        arrangementSource: (songId, key) => {
          const song = byId.get(songId);
          return song ? sourceFromSummary(song, key) : null;
        },
      });
      setClassified({
        source: new Map(rows.map((row) => [row.id, row])),
        index,
        list,
        byId: new Map(list.map((item) => [item.id, item])),
      });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [rows, index, songs, importingNow]);

  const busy = reading !== null || importingNow;
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  // Counts and the previous classification stay on screen while a debounce is pending;
  // actions that act on the classification wait until it is current.
  const upToDate =
    classified.index === index &&
    rows.length === classified.source.size &&
    rows.every((row) => classified.source.get(row.id) === row) &&
    !importingNow;
  const done = (row: ClassifiedRow) => {
    const status = results?.get(row.id)?.status;
    return status === 'imported' || status === 'existing';
  };
  const readyRows = classified.list.filter((row) => isImportable(row) && !done(row));
  const ready = importingNow ? frozenReady : readyRows.length;

  const addFiles = (picked: File[]) => {
    const pdfs = picked.filter(isPdf);
    if (busyRef.current) return;
    setNonPdf(picked.length - pdfs.length);
    if (pdfs.length === 0) return;
    busyRef.current = true;
    setCancelled(false);
    const slots: Array<BatchRow | undefined> = Array.from({ length: pdfs.length });
    const known = new Set([
      ...artistsRef.current,
      ...rowsRef.current.map((r) => r.artist).filter(Boolean),
    ]);
    let finished = 0;
    setReading({ done: 0, total: pdfs.length });
    void runPool(pdfs, READ_CONCURRENCY, async (file, i) => {
      const label = file.webkitRelativePath || file.name;
      let row: BatchRow;
      try {
        const read = await readPdf(file, [...known]);
        const { suggestion } = read;
        if (suggestion.artist) known.add(suggestion.artist);
        row = {
          id: `row-${++nextId.current}`,
          fileName: label,
          file,
          title: suggestion.title.slice(0, MAX_TEXT),
          artist: suggestion.artist.slice(0, MAX_TEXT),
          key: (suggestion.key ? parseKey(suggestion.key)?.name : null) ?? null,
          chordCount: read.chordCount,
          suspects: [...new Set(read.suspects.flat())],
          ignoredChordLines: read.ignoredChordLines,
          sizeOk: file.size <= MAX_BYTES,
        };
      } catch {
        // Unreadable PDF: shows up as "fora do padrão" so it lands in the report.
        row = {
          id: `row-${++nextId.current}`,
          fileName: label,
          file,
          title: '',
          artist: '',
          key: null,
          chordCount: 0,
          suspects: [],
          ignoredChordLines: 0,
          sizeOk: file.size <= MAX_BYTES,
          readError: 'não foi possível ler o PDF',
        };
      }
      slots[i] = row;
      finished += 1;
      setReading({ done: finished, total: pdfs.length });
    }).then(() => {
      const added = slots.filter((r): r is BatchRow => r !== undefined);
      setRows((prev) => [...prev, ...added]);
      setReading(null);
    });
  };

  const edit = useCallback(
    (id: string, patch: Partial<BatchRow>) =>
      setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row))),
    [],
  );

  const startImport = async () => {
    if (abort.current || busyRef.current) return;
    const groups = planImport(readyRows);
    const total = groups.reduce((sum, g) => sum + g.rows.length, 0);
    const created = new Map<string, string>();
    const controller = new AbortController();
    abort.current = controller;
    busyRef.current = true;
    setCancelled(false);
    setCancelling(false);
    setFrozenReady(readyRows.length);
    setResults((prev) => prev ?? new Map());
    setQueued(new Set(groups.flatMap((g) => g.rows.map((r) => r.id))));
    setImporting({ done: 0, total });
    const worker = async (row: ClassifiedRow): Promise<'imported' | 'existing'> => {
      const identity = identityOf(row.title, row.artist);
      const base = { file: row.file, key: row.key!, chordCount: row.chordCount };
      const songId = created.get(identity) ?? index.get(identity)?.id;
      const plan: UploadPlan = !songId
        ? { ...base, action: 'new-song', title: row.title.trim(), artistName: row.artist.trim() }
        : row.status === 'substitui gerado'
          ? { ...base, action: 'replace-generated', songId }
          : { ...base, action: 'add-key', songId };
      try {
        const saved = await saveUpload(api, plan);
        created.set(identity, saved.songId);
        return 'imported';
      } catch (error) {
        if (error instanceof ArrangementExistsError) return 'existing';
        throw error;
      }
    };
    await runImport(groups, worker, {
      concurrency: 2,
      signal: controller.signal,
      onProgress: (d, t) => setImporting({ done: d, total: t }),
      onResult: (id, result) => setResults((prev) => new Map(prev).set(id, result)),
    });
    abort.current = null;
    setCancelled(controller.signal.aborted);
    setCancelling(false);
    setImporting(null);
    // Re-run the classification against the updated catalog.
    setRows((prev) => [...prev]);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (busyRef.current) return;
    void filesFromDrop(event.dataTransfer).then(addFiles);
  };

  const summary = useMemo(() => {
    if (!results) return null;
    const all = [...results.values()];
    const count = (status: RowResult['status']) => all.filter((r) => r.status === status).length;
    return `${count('imported')} importados · ${count('existing')} já existiam · ${count('error')} com erro`;
  }, [results]);

  const picker = (label: string, folder: boolean) => (
    <label className="btn file-pick">
      {label}
      <input
        type="file"
        className="sr-only"
        aria-label={label}
        disabled={busy}
        {...(folder ? { webkitdirectory: '' } : { multiple: true, accept: 'application/pdf' })}
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </label>
  );

  return (
    <section className="import-page">
      <header className="import-head">
        <h1 className="page-title">Importar em lote</h1>
        {rows.length > 0 && (
          <span className="chip">{`${rows.length} arquivos · ${ready} prontos`}</span>
        )}
      </header>

      <div
        className={`dropzone${dragging && !busy ? ' dropzone-active' : ''}${busy ? ' dropzone-disabled' : ''}`}
        aria-disabled={busy}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p>Arraste PDFs ou uma pasta aqui</p>
        {busy && <p className="dropzone-note">Aguarde terminar antes de adicionar arquivos.</p>}
        <div className="dropzone-actions">
          {picker('Escolher arquivos', false)}
          {picker('Escolher pasta', true)}
        </div>
      </div>

      {nonPdf > 0 && (
        <p role="status" className="banner banner-warn">
          Ignoramos {nonPdf} arquivo(s) que não são PDF.
        </p>
      )}
      {reading && (
        <p role="status" className="status">
          Lendo {reading.done} de {reading.total}…
        </p>
      )}
      {rows.length > 0 && (
        <>
          <div
            className="table-wrap"
            role="region"
            tabIndex={0}
            aria-label="Tabela de arquivos para importar"
          >
            <table className="import-table">
              <caption className="sr-only">Arquivos para importar</caption>
              <thead>
                <tr>
                  <th scope="col">Arquivo</th>
                  <th scope="col">Música</th>
                  <th scope="col">
                    <span className="sr-only">Inverter</span>
                    <span aria-hidden="true">⇄</span>
                  </th>
                  <th scope="col">Cantor</th>
                  <th scope="col">Tom</th>
                  <th scope="col">Acordes</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const item = classified.byId.get(row.id);
                  return (
                    <ImportRow
                      key={row.id}
                      row={row}
                      classified={item && classified.source.get(row.id) === row ? item : null}
                      result={results?.get(row.id)}
                      busy={busy}
                      onEdit={edit}
                    />
                  );
                })}
              </tbody>
            </table>
            <datalist id="import-artists">
              {catalogArtists.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>

          {summary && !importing && (
            <p role="status" className="banner banner-ok">
              {summary}
            </p>
          )}
          {cancelled && !importing && (
            <p role="status" className="banner banner-warn">
              Importação cancelada. As linhas não importadas continuam prontas para tentar de novo.
            </p>
          )}

          <div className="import-actions">
            {importing ? (
              <>
                <button
                  type="button"
                  className="btn cancel-btn"
                  disabled={cancelling}
                  onClick={() => {
                    setCancelling(true);
                    abort.current?.abort();
                  }}
                >
                  {cancelling ? 'Cancelando…' : 'Cancelar'}
                </button>
                <p role="status" className="status">
                  Importando {importing.done} de {importing.total}…
                </p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn"
                  disabled={!upToDate}
                  onClick={() =>
                    downloadCsv(
                      toCsv(
                        classified.list.filter((row) => !done(row)),
                        results,
                        results ? queued : undefined,
                      ),
                    )
                  }
                >
                  ⬇ Relatório CSV
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !upToDate || readyRows.length === 0}
                  onClick={() => void startImport()}
                >
                  Importar {ready} prontos
                </button>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

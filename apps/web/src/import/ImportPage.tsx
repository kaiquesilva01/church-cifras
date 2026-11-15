import { KEY_OPTIONS, parseKey, type KeyName } from '@cifras/chords';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ArrangementExistsError, saveUpload, type CatalogApi } from '../catalog/catalogApi';
import { deriveArtists } from '../catalog/search';
import { MAX_TEXT } from '../catalog/songText';
import { useSongsContext } from '../catalog/SongsProvider';
import type { SongSummary, UploadPlan } from '../catalog/types';
import type { ReadPdf } from '../upload/UploadPage';
import {
  MAX_BYTES,
  classifyRows,
  identityOf,
  isImportable,
  planImport,
  type BatchRow,
  type BatchStatus,
  type ClassifiedRow,
} from './batch';
import { toCsv } from './csv';
import { filesFromDrop, isPdf, runPool } from './readFiles';
import { runImport, type RowResult } from './queue';

const DEBOUNCE_MS = 300;
const READ_CONCURRENCY = 2;

type Classified = {
  source: BatchRow[];
  index: ReadonlyMap<string, SongSummary> | null;
  list: ClassifiedRow[];
};
type Progress = { done: number; total: number };

const PILL: Record<BatchStatus, string> = {
  pronto: 'pill-green',
  'já existe — novo tom': 'pill-blue',
  'substitui gerado': 'pill-purple',
  'conflito: tom feito à mão já existe': 'pill-amber',
  'duplicado no lote': 'pill-amber',
  'falta a música': 'pill-amber',
  'falta o cantor': 'pill-amber',
  'falta o tom': 'pill-amber',
  'grande demais': 'pill-red',
  'fora do padrão': 'pill-red',
};

function describeResult(result: RowResult): { label: string; className: string; detail: string } {
  if (result.status === 'imported')
    return { label: 'importado', className: 'pill-green', detail: '' };
  if (result.status === 'existing')
    return { label: 'já existia', className: 'pill-blue', detail: '' };
  return { label: `erro: ${result.message}`, className: 'pill-red', detail: '' };
}

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
  const [classified, setClassified] = useState<Classified>({ source: [], index: null, list: [] });
  const [lookupFailed, setLookupFailed] = useState(false);
  const [reading, setReading] = useState<Progress | null>(null);
  const [nonPdf, setNonPdf] = useState(0);
  const [importing, setImporting] = useState<Progress | null>(null);
  const [results, setResults] = useState<Map<string, RowResult> | undefined>(undefined);
  const [queued, setQueued] = useState<ReadonlySet<string>>(new Set());
  const [cancelled, setCancelled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [frozenReady, setFrozenReady] = useState(0);
  const [dragging, setDragging] = useState(false);

  const cache = useRef(new Map<string, 'handmade' | 'generated' | null>());
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

  // Classification: looks up the arrangements of rows whose song exists, then classifies.
  // Paused while importing: the catalog changes under us and results are tracked per row.
  useEffect(() => {
    if (importingNow) return;
    let stale = false;
    const timer = setTimeout(() => {
      void (async () => {
        const needed = new Map<string, { songId: string; key: KeyName }>();
        for (const row of rows) {
          if (!row.key) continue;
          const song = index.get(identityOf(row.title, row.artist));
          if (song && !cache.current.has(`${song.id}|${row.key}`)) {
            needed.set(`${song.id}|${row.key}`, { songId: song.id, key: row.key });
          }
        }
        let failed = false;
        await Promise.all(
          [...needed].map(async ([cacheKey, { songId, key }]) => {
            try {
              const found = await api.getArrangement(songId, key);
              if (!stale) cache.current.set(cacheKey, found?.source ?? null);
            } catch {
              failed = true;
            }
          }),
        );
        if (stale) return;
        const list = classifyRows(rows, {
          findSong: (titleNormalized, artistId) =>
            index.get(`${titleNormalized}|${artistId}`) ?? null,
          arrangementSource: (songId, key) => cache.current.get(`${songId}|${key}`) ?? null,
        });
        setLookupFailed(failed);
        setClassified({ source: rows, index, list });
      })();
    }, DEBOUNCE_MS);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [rows, index, api, importingNow]);

  const busy = reading !== null || importingNow;
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);
  const sameRows = classified.source === rows;
  const upToDate = sameRows && classified.index === index && !importingNow;
  const classifiedById = useMemo(
    () => new Map(classified.list.map((item) => [item.id, item])),
    [classified.list],
  );
  const done = (row: ClassifiedRow) => {
    const status = results?.get(row.id)?.status;
    return status === 'imported' || status === 'existing';
  };
  const readyRows = classified.list.filter((row) => isImportable(row) && !done(row));
  const ready = importingNow ? frozenReady : sameRows ? readyRows.length : 0;

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
          readError: true,
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

  const edit = (id: string, patch: Partial<BatchRow>) =>
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));

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
    // Lookups were paused during the import, so nothing in flight can repopulate this.
    cache.current.clear();
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

  const keyOptions = (
    <>
      <option value="">—</option>
      <optgroup label="Maiores">
        {KEY_OPTIONS.major.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </optgroup>
      <optgroup label="Menores">
        {KEY_OPTIONS.minor.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </optgroup>
    </>
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
      {lookupFailed && (
        <p role="alert" className="error">
          Não foi possível verificar alguns tons no catálogo. Confira o resultado antes de importar.
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
                  const c = classifiedById.get(row.id);
                  const result = results?.get(row.id);
                  const shown = result && result.status !== 'error' ? describeResult(result) : null;
                  const errored = result?.status === 'error' ? describeResult(result) : null;
                  const pill = shown ?? errored;
                  return (
                    <tr key={row.id} aria-label={row.fileName}>
                      <th scope="row" className="cell-file" title={row.fileName}>
                        {row.fileName}
                      </th>
                      <td>
                        <input
                          className="input"
                          aria-label={`Música de ${row.fileName}`}
                          maxLength={MAX_TEXT}
                          value={row.title}
                          disabled={busy}
                          onChange={(e) => edit(row.id, { title: e.target.value })}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-icon"
                          aria-label={`Inverter música e cantor de ${row.fileName}`}
                          disabled={busy}
                          onClick={() => edit(row.id, { title: row.artist, artist: row.title })}
                        >
                          ⇄
                        </button>
                      </td>
                      <td>
                        <input
                          className="input"
                          list="import-artists"
                          aria-label={`Cantor de ${row.fileName}`}
                          maxLength={MAX_TEXT}
                          value={row.artist}
                          disabled={busy}
                          onChange={(e) => edit(row.id, { artist: e.target.value })}
                        />
                      </td>
                      <td>
                        <select
                          className="input"
                          aria-label={`Tom de ${row.fileName}`}
                          value={row.key ?? ''}
                          disabled={busy}
                          onChange={(e) =>
                            edit(row.id, { key: (e.target.value || null) as KeyName | null })
                          }
                        >
                          {keyOptions}
                        </select>
                      </td>
                      <td className="cell-num">{row.chordCount}</td>
                      <td>
                        {pill ? (
                          <span className={`pill ${pill.className}`}>{pill.label}</span>
                        ) : c && sameRows ? (
                          <>
                            <span className={`pill ${PILL[c.status]}`}>{c.status}</span>
                            {c.detail && <span className="cell-detail">{c.detail}</span>}
                            {c.warnings.map((warning) => (
                              <span key={warning} className="cell-detail cell-warning">
                                {warning}
                              </span>
                            ))}
                          </>
                        ) : (
                          <span className="muted">Verificando…</span>
                        )}
                      </td>
                    </tr>
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

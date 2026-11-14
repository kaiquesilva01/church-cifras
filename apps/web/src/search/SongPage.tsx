import { compareKeys, keyFromSlug } from '@cifras/chords';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import type { CatalogApi } from '../catalog/catalogApi';
import type { ArrangementSummary } from '../catalog/types';
import { useSongs } from '../catalog/useSongs';
import { KeyChips } from './KeyChips';

type PdfState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'missing' }
  | { status: 'error' };

export function SongPage({ api }: { api: CatalogApi }) {
  const { songId } = useParams();
  const [params] = useSearchParams();
  const { status, songs } = useSongs(api);
  const song = songs.find((s) => s.id === songId);

  // Os tons v�m dos arranjos (tempo real); song.keys (Function) pode atrasar logo ap�s salvar.
  const [loaded, setLoaded] = useState<{ songId: string; list: ArrangementSummary[] } | null>(null);
  useEffect(() => {
    if (!songId) return;
    return api.subscribeArrangements(
      songId,
      (list) => setLoaded({ songId, list }),
      () => setLoaded(null),
    );
  }, [api, songId]);
  const arrangements = useMemo(
    () => (loaded && loaded.songId === songId ? loaded.list : null),
    [loaded, songId],
  );
  const keys = useMemo(
    () =>
      arrangements ? [...arrangements.map((a) => a.key)].sort(compareKeys) : (song?.keys ?? []),
    [arrangements, song],
  );

  const fromUrl = keyFromSlug(params.get('tom') ?? '');
  const selected =
    fromUrl && keys.includes(fromUrl)
      ? fromUrl
      : (arrangements?.find((a) => a.source === 'handmade')?.key ??
        (arrangements ? keys[0] : (song?.handmadeKeys[0] ?? song?.keys[0])));
  const knownPath = arrangements?.find((a) => a.key === selected)?.storagePath;

  const [pdf, setPdf] = useState<{ for: string; state: PdfState } | null>(null);
  const sid = song?.id;
  const requestId = sid && selected ? `${sid}:${selected}:${knownPath ?? ''}` : null;

  useEffect(() => {
    if (!sid || !selected || !requestId) return;
    let cancelled = false;
    const finish = (state: PdfState) => {
      if (!cancelled) setPdf({ for: requestId, state });
    };
    const open = (path: string) =>
      api.getPdfUrl(path).then((url) => finish({ status: 'ready', url }));
    (knownPath
      ? open(knownPath)
      : api
          .getArrangement(sid, selected)
          .then((a) => (a ? open(a.storagePath) : finish({ status: 'missing' })))
    ).catch(() => finish({ status: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [api, sid, selected, knownPath, requestId]);

  if (status === 'loading') {
    return (
      <p role="status" className="status">
        Carregando…
      </p>
    );
  }
  if (!song && status === 'error') {
    return (
      <p role="alert" className="error">
        Não foi possível carregar as cifras.
      </p>
    );
  }
  if (!song) {
    return (
      <p className="status">
        Música não encontrada. <Link to="/">Voltar</Link>
      </p>
    );
  }
  const pdfState: PdfState = pdf?.for === requestId ? pdf.state : { status: 'loading' };

  return (
    <section className="card">
      <Link to="/" className="back">
        ‹ Início
      </Link>
      <h2>{song.title}</h2>
      <p className="muted">{song.artistName}</p>
      <KeyChips songId={song.id} title={song.title} keys={keys} selected={selected} replace />
      {pdfState.status === 'ready' && (
        <a
          className="btn btn-primary"
          href={pdfState.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir PDF
        </a>
      )}
      {pdfState.status === 'loading' && selected && (
        <p role="status" className="status">
          Carregando PDF…
        </p>
      )}
      {pdfState.status === 'missing' && <p className="status">PDF indisponível para este tom.</p>}
      {pdfState.status === 'error' && (
        <p role="alert" className="error">
          Não foi possível abrir o PDF.
        </p>
      )}
    </section>
  );
}

import { useMemo, useState } from 'react';
import { searchSongSections } from '../catalog/search';
import type { SongSummary } from '../catalog/types';
import { Dialog } from '../viewer/Dialog';
import { defaultKeyFor } from './items';

export interface AddSongSheetProps {
  songs: SongSummary[];
  /** Músicas que já estão no repertório (ainda podem ser adicionadas de novo). */
  presentSongIds: ReadonlySet<string>;
  onAdd: (song: SongSummary) => void;
  onClose: () => void;
}

const FILTERS = ['Tudo', 'Músicas', 'Harpa'] as const;
type Filter = (typeof FILTERS)[number];

export function AddSongSheet({ songs, presentSongIds, onAdd, onClose }: AddSongSheetProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('Tudo');
  const { musicas, harpa } = useMemo(() => searchSongSections(songs, query), [songs, query]);
  const showMusicas = filter !== 'Harpa';
  const showHarpa = filter !== 'Músicas';
  const shownCount = (showMusicas ? musicas.length : 0) + (showHarpa ? harpa.length : 0);
  const trimmed = query.trim();

  const section = (title: string, list: SongSummary[]) => (
    <>
      <h2 className="section-title">{title}</h2>
      <ul className="list add-song-list">
        {list.map((song) => (
          <li key={song.id}>
            <button
              type="button"
              className="add-song-option"
              disabled={defaultKeyFor(song) === null}
              onClick={() => onAdd(song)}
            >
              <span className="song-title">{song.title}</span>
              <span className="muted">{song.artistName}</span>
              {presentSongIds.has(song.id) && <span className="pill pill-blue">já está</span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <Dialog titleId="add-song-title" onClose={onClose}>
      <h2 id="add-song-title" className="dialog-title">
        Adicionar música
      </h2>
      <input
        type="search"
        className="search"
        aria-label="Buscar música ou cantor…"
        placeholder="Buscar música ou cantor…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="filter-row" role="group" aria-label="Filtrar resultados">
        {FILTERS.map((name) => (
          <button
            key={name}
            type="button"
            className="filter-chip"
            aria-pressed={filter === name}
            onClick={() => setFilter(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {shownCount === 0 && (
        <p className="status">
          {trimmed ? `Nada encontrado para “${trimmed}”.` : 'Nenhuma cifra ainda.'}
        </p>
      )}
      {showMusicas && musicas.length > 0 && section('Músicas', musicas)}
      {showHarpa && harpa.length > 0 && section('Harpa', harpa)}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Dialog>
  );
}

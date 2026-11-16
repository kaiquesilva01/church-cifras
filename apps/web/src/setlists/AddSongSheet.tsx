import { useMemo, useState } from 'react';
import { filterSongs } from '../catalog/search';
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

export function AddSongSheet({ songs, presentSongIds, onAdd, onClose }: AddSongSheetProps) {
  const [query, setQuery] = useState('');
  const visible = useMemo(
    () =>
      filterSongs(songs, query).sort((x, y) =>
        x.titleNormalized.localeCompare(y.titleNormalized, 'pt-BR'),
      ),
    [songs, query],
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
      {visible.length === 0 ? (
        <p className="status">Nada encontrado para “{query.trim()}”.</p>
      ) : (
        <ul className="list add-song-list">
          {visible.map((song) => (
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
      )}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Dialog>
  );
}

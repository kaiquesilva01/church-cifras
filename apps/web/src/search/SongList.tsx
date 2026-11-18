import { Link } from 'react-router';
import type { SongSummary } from '../catalog/types';
import { defaultKeyFor } from '../setlists/items';
import { KeyChips } from './KeyChips';

const CHEVRON = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export function SongList({ songs }: { songs: SongSummary[] }) {
  return (
    <ul className="list">
      {songs.map((song) => {
        const key = defaultKeyFor(song);
        return (
          <li key={song.id} className="list-card song-card">
            <Link to={`/musicas/${song.id}`} className="list-main song-main">
              <span className="key-tile" aria-hidden="true">
                <span className="key-tile-label">Tom</span>
                <span className="key-tile-value">{key ?? '–'}</span>
              </span>
              <span className="song-text">
                <span className="song-title">{song.title}</span>{' '}
                <span className="muted">{song.artistName}</span>
              </span>
              <span className="song-chevron">{CHEVRON}</span>
            </Link>
            <KeyChips
              songId={song.id}
              title={song.title}
              keys={song.keys}
              selected={key ?? undefined}
              compact
            />
          </li>
        );
      })}
    </ul>
  );
}

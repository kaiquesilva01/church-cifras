import { Link } from 'react-router';
import type { SongSummary } from '../catalog/types';
import { KeyChips } from './KeyChips';

export function SongList({ songs }: { songs: SongSummary[] }) {
  return (
    <ul className="list">
      {songs.map((song) => (
        <li key={song.id} className="list-card">
          <Link to={`/musicas/${song.id}`} className="list-main">
            <span className="song-title">{song.title}</span>
            <span className="muted">{song.artistName}</span>
          </Link>
          <KeyChips songId={song.id} title={song.title} keys={song.keys} />
        </li>
      ))}
    </ul>
  );
}

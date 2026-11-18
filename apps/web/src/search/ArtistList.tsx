import { Link } from 'react-router';
import type { ArtistSummary } from '../catalog/types';
import { initialsOf } from '../ui/initials';

export function ArtistList({ artists }: { artists: ArtistSummary[] }) {
  return (
    <ul className="list">
      {artists.map((artist) => (
        <li key={artist.id} className="list-card artist-card">
          <Link to={`/cantores/${artist.id}`} className="list-main artist-row">
            <span className="avatar avatar-lg" aria-hidden="true">
              {initialsOf(artist.name)}
            </span>
            <span className="song-title">{artist.name}</span>
            <span className="muted">
              {artist.songCount === 1 ? '1 música' : `${artist.songCount} músicas`} ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

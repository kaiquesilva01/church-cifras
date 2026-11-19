import { Fragment } from 'react';
import { Link } from 'react-router';
import type { SnippetPart } from '../catalog/lyricsSearch';
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

/** Parts are joined by a space, except the "…" marks, which sit against their neighbour. */
function LyricSnippet({ parts }: { parts: SnippetPart[] }) {
  return (
    <p className="lyric-snippet">
      {parts.map((part, index) => {
        const previous = parts[index - 1];
        const space = previous && previous.text !== '…' && part.text !== '…' ? ' ' : '';
        return (
          <Fragment key={index}>
            {space}
            {part.match ? <mark className="lyric-hit">{part.text}</mark> : part.text}
          </Fragment>
        );
      })}
    </p>
  );
}

export function SongList({
  songs,
  snippets,
}: {
  songs: SongSummary[];
  /** Lyrics snippet per song id, shown at the bottom of the card when there is one. */
  snippets?: ReadonlyMap<string, SnippetPart[]>;
}) {
  return (
    <ul className="list">
      {songs.map((song) => {
        const key = defaultKeyFor(song);
        const snippet = snippets?.get(song.id);
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
            {snippet && <LyricSnippet parts={snippet} />}
          </li>
        );
      })}
    </ul>
  );
}

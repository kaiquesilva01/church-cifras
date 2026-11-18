export type PadOwner = { kind: 'song'; songId: string } | { kind: 'setlist'; setlistId: string };

export function padOwnerFor(songId: string, setlistId: string | null): PadOwner {
  return setlistId ? { kind: 'setlist', setlistId } : { kind: 'song', songId };
}

const SONG_PATH = /^\/musicas\/([^/]+)\/?$/;
const SETLIST_PATH = /^\/repertorios\/([^/]+)\/?$/;

/** Whether a playing pad keeps playing on the given location (spec §5.2). */
export function padStaysOn(owner: PadOwner, pathname: string, search: string): boolean {
  const setlistParam = new URLSearchParams(search).get('repertorio');
  const songMatch = SONG_PATH.exec(pathname);

  if (owner.kind === 'song') {
    return songMatch !== null && songMatch[1] === owner.songId && !setlistParam;
  }

  if (songMatch) return setlistParam === owner.setlistId;
  const setlistMatch = SETLIST_PATH.exec(pathname);
  return setlistMatch !== null && setlistMatch[1] === owner.setlistId;
}

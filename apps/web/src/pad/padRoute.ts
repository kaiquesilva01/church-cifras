export type PadOwner =
  | { kind: 'song'; songId: string }
  | { kind: 'setlist'; setlistId: string }
  /** Started from the Pad tab: not tied to any route, so it only stops by its own toggle. */
  | { kind: 'free' };

export function padOwnerFor(songId: string, setlistId: string | null): PadOwner {
  return setlistId ? { kind: 'setlist', setlistId } : { kind: 'song', songId };
}

const PAD_TAB_PATH = /^\/pad\/?$/;
const SONG_PATH = /^\/musicas\/([^/]+)\/?$/;
const SETLIST_PATH = /^\/repertorios\/([^/]+)\/?$/;

/** Whether a playing pad keeps playing on the given location (spec §5.2). */
export function padStaysOn(owner: PadOwner, pathname: string, search: string): boolean {
  if (owner.kind === 'free') return true;
  // The Pad tab is the status screen of whatever is playing: it never ends the pad itself.
  if (PAD_TAB_PATH.test(pathname)) return true;
  const setlistParam = new URLSearchParams(search).get('repertorio');
  const songMatch = SONG_PATH.exec(pathname);

  if (owner.kind === 'song') {
    return songMatch !== null && songMatch[1] === owner.songId && !setlistParam;
  }

  if (songMatch) return setlistParam === owner.setlistId;
  const setlistMatch = SETLIST_PATH.exec(pathname);
  return setlistMatch !== null && setlistMatch[1] === owner.setlistId;
}

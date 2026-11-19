export type PadOwner =
  | { kind: 'song'; songId: string }
  | { kind: 'setlist'; setlistId: string }
  /** Started from the Pad tab. */
  | { kind: 'free' };

export function padOwnerFor(songId: string, setlistId: string | null): PadOwner {
  return setlistId ? { kind: 'setlist', setlistId } : { kind: 'song', songId };
}

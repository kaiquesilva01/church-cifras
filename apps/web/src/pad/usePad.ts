import { createContext, useContext } from 'react';
import type { KeyName } from '@cifras/chords';
import type { PadNote } from './padNotes';
import type { PadOwner } from './padRoute';

export interface PadContextValue {
  status: 'off' | 'loading' | 'playing' | 'error';
  note: PadNote | null;
  owner: PadOwner | null;
  /** 0..1 */
  volume: number;
  notice: string | null;
  /** Tones whose loop is already saved on this device (works offline, no download on tap). */
  cachedNotes: ReadonlySet<PadNote>;
  /** The Pad button; synchronous up to the AudioContext creation (iOS gesture). */
  toggle(key: KeyName, owner: PadOwner): void;
  follow(key: KeyName | null): void;
  setVolume(volume: number): void;
  prefetch(keys: readonly KeyName[]): void;
}

export const PadContext = createContext<PadContextValue | null>(null);

/** Null outside the provider. */
export function usePad(): PadContextValue | null {
  return useContext(PadContext);
}

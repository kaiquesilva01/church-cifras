import { parseKey, type KeyName } from '@cifras/chords';
import manifest from './padManifest.json';

export type PadNote = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';

export interface PadSample {
  note: PadNote;
  storagePath: string;
  introBars: number;
  loopStartSec: number;
  loopEndSec: number;
}

/** Duração de um compasso (4 tempos a 70 BPM). */
export const BAR_SEC = 240 / 70;
/** Compassos do trecho em loop. */
export const LOOP_BARS = 16;

const NOTES_BY_PC: readonly PadNote[] = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

function sample(note: PadNote): PadSample {
  const { file, introBars } = manifest.files[note];
  return {
    note,
    storagePath: `pads/${manifest.version}/${file}.m4a`,
    introBars,
    loopStartSec: introBars * BAR_SEC,
    loopEndSec: (introBars + LOOP_BARS) * BAR_SEC,
  };
}

// Fonte única: padManifest.json (também conferido por scripts/pads/upload.mjs).
export const PAD_SAMPLES: Record<PadNote, PadSample> = Object.fromEntries(
  NOTES_BY_PC.map((note) => [note, sample(note)]),
) as Record<PadNote, PadSample>;

/** Nota do pad para um tom (maior/menor ignorado); null se o tom for inválido. */
export function padNoteFor(key: KeyName): PadNote | null {
  const parsed = parseKey(key);
  return parsed ? (NOTES_BY_PC[parsed.tonicPc] ?? null) : null;
}

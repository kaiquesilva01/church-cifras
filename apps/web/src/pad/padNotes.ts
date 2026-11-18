import { parseKey, type KeyName } from '@cifras/chords';

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

const NOTES_BY_PC: readonly PadNote[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function sample(note: PadNote, file: string, introBars: number): PadSample {
  return {
    note,
    storagePath: `pads/${file}.m4a`,
    introBars,
    loopStartSec: introBars * BAR_SEC,
    loopEndSec: (introBars + LOOP_BARS) * BAR_SEC,
  };
}

// introBars vêm do manifesto dos loops produzidos (relatorio.json); não alterar à mão.
export const PAD_SAMPLES: Record<PadNote, PadSample> = {
  C: sample('C', 'DS04-C', 8),
  'C#': sample('C#', 'DS05-Cs', 7),
  D: sample('D', 'DS06-D', 6),
  'D#': sample('D#', 'DS07-Ds', 5),
  E: sample('E', 'DS08-E', 6),
  F: sample('F', 'DS09-F', 7),
  'F#': sample('F#', 'DS10-Fs', 7),
  G: sample('G', 'DS11-G', 4),
  'G#': sample('G#', 'DS12-Gs', 5),
  A: sample('A', 'DS01-A', 4),
  'A#': sample('A#', 'DS02-As', 6),
  B: sample('B', 'DS03-B', 7),
};

/** Nota do pad para um tom (maior/menor ignorado); null se o tom for inválido. */
export function padNoteFor(key: KeyName): PadNote | null {
  const parsed = parseKey(key);
  return parsed ? (NOTES_BY_PC[parsed.tonicPc] ?? null) : null;
}

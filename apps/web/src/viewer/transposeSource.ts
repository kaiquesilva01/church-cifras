import { compareKeys } from '@cifras/chords';
import type { KeyName } from '@cifras/chords';
import type { ArrangementView } from './useSongArrangements';

// Source of a transposition: the open key if handmade; else the handmade key it was derived from;
// else the first handmade key. Never a generated one, so errors do not compound.
export function pickTransposeSource(
  arrangements: ArrangementView[],
  openKey: KeyName | null,
): ArrangementView | null {
  const handmade = arrangements
    .filter((a) => a.source === 'handmade')
    .sort((a, b) => compareKeys(a.key, b.key));
  const open = openKey ? arrangements.find((a) => a.key === openKey) : undefined;
  if (open?.source === 'handmade') return open;
  const derived = open?.derivedFromKey;
  return (derived ? handmade.find((a) => a.key === derived) : undefined) ?? handmade[0] ?? null;
}

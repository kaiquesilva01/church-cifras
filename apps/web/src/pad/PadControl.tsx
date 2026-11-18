import type { KeyName } from '@cifras/chords';
import { padNoteFor } from './padNotes';
import type { PadOwner } from './padRoute';
import { PadVolume } from './PadVolume';
import { usePad } from './usePad';

export function PadControl({ keyName, owner }: { keyName: KeyName | null; owner: PadOwner }) {
  const pad = usePad();
  if (!pad) return null;
  const { status } = pad;
  // While a pad is active the control stays (and can stop it) even if the key is momentarily
  // unknown, e.g. the next cifra of a setlist is still loading its arrangements.
  const validKey = keyName !== null && padNoteFor(keyName) !== null ? keyName : null;
  const target = validKey ?? (status !== 'off' ? pad.note : null);
  if (target === null) return null;
  const label =
    status === 'loading'
      ? 'Carregando pad…'
      : status === 'playing'
        ? `Pad ${pad.note ?? ''}`.trim()
        : status === 'error'
          ? 'Pad indisponível · tentar de novo'
          : null;

  return (
    <div className="pad-control">
      <button
        type="button"
        className="btn"
        aria-pressed={status === 'playing'}
        aria-busy={status === 'loading' || undefined}
        onClick={() => pad.toggle(target, owner)}
      >
        {label ?? (
          <>
            <span aria-hidden="true">♪ </span>Pad
          </>
        )}
      </button>
      {status === 'playing' && <PadVolume volume={pad.volume} onChange={pad.setVolume} />}
      {pad.notice && (
        <p role="status" className="muted">
          {pad.notice}
        </p>
      )}
    </div>
  );
}

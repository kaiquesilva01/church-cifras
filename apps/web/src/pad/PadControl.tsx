import type { KeyName } from '@cifras/chords';
import { padNoteFor } from './padNotes';
import type { PadOwner } from './padRoute';
import { usePad } from './usePad';

export function PadControl({ keyName, owner }: { keyName: KeyName | null; owner: PadOwner }) {
  const pad = usePad();
  if (!pad || keyName === null || padNoteFor(keyName) === null) return null;

  const { status } = pad;
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
        onClick={() => pad.toggle(keyName, owner)}
      >
        {label ?? (
          <>
            <span aria-hidden="true">♪ </span>Pad
          </>
        )}
      </button>
      {status === 'playing' && (
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          aria-label="Volume do pad"
          value={Math.round(pad.volume * 100)}
          onChange={(event) => pad.setVolume(Number(event.currentTarget.value) / 100)}
        />
      )}
      {pad.notice && (
        <p role="status" className="muted">
          {pad.notice}
        </p>
      )}
    </div>
  );
}

import { PadVolume } from './PadVolume';
import { usePad } from './usePad';

export function PadMini({ setlistId }: { setlistId: string }) {
  const pad = usePad();
  if (!pad) return null;
  const { status, owner } = pad;
  if (status !== 'playing' && status !== 'loading') return null;
  if (owner?.kind !== 'setlist' || owner.setlistId !== setlistId) return null;
  const label = status === 'loading' ? 'Carregando pad…' : `Pad ${pad.note ?? ''} tocando`;

  return (
    <div className="pad-mini">
      <span className="pad-mini-label">{label}</span>
      {/* While playing/loading the provider's toggle only halts and ignores the key. */}
      <button
        type="button"
        className="btn pad-mini-stop"
        onClick={() => pad.toggle(pad.note ?? 'C', owner)}
      >
        Parar
      </button>
      {status === 'playing' && <PadVolume volume={pad.volume} onChange={pad.setVolume} />}
      <p role="status" className="muted">
        {pad.notice}
      </p>
    </div>
  );
}

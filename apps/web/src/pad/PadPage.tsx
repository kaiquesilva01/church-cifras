import { useSongsContext } from '../catalog/SongsProvider';
import { shortDate } from '../setlists/format';
import { useSetlistsContext } from '../setlists/SetlistsProvider';
import { ScreenHeader } from '../ui/ScreenHeader';
import { padNoteFor } from './padNotes';
import { PadVolume } from './PadVolume';
import { usePad } from './usePad';

/** Status and volume of the pad; it plays whatever the open cifra (or setlist) asks for. */
export function PadPage() {
  const pad = usePad();
  const { songs } = useSongsContext();
  const { setlists } = useSetlistsContext();
  const volume = pad?.volume ?? 0.6;
  const playing = pad?.status === 'playing' || pad?.status === 'loading';

  const owner = pad?.owner ?? null;
  const song = owner?.kind === 'song' ? songs.find((s) => s.id === owner.songId) : undefined;
  const setlist =
    owner?.kind === 'setlist' ? setlists.find((s) => s.id === owner.setlistId) : undefined;
  const context = playing
    ? song
      ? `${song.title} · ${song.artistName}`
      : setlist
        ? `${setlist.label} · ${shortDate(setlist.date)}`
        : null
    : null;
  const sequence = setlist ? setlist.items.map((item) => padNoteFor(item.key) ?? item.key) : [];

  let title = 'Pad desligado';
  if (pad?.status === 'loading') title = 'Carregando pad…';
  else if (pad?.status === 'playing') title = 'Tocando · seguindo a cifra';
  else if (pad?.status === 'error') title = 'Pad indisponível';

  return (
    <section>
      <ScreenHeader eyebrow="Fundo musical" title="Pad" />
      <div className={playing ? 'pad-card is-playing' : 'pad-card'}>
        <span className="pad-note" aria-label={playing ? `Nota ${pad?.note ?? ''}` : 'Sem nota'}>
          {playing ? (pad?.note ?? '–') : '–'}
        </span>
        <p role="status" className="pad-title">
          {title}
        </p>
        {context && <p className="pad-context">{context}</p>}
        {!playing && pad?.status !== 'error' && (
          <p className="muted pad-hint">
            Abra uma cifra e toque em <strong>Pad</strong> na barra de baixo. O tom acompanha a
            cifra.
          </p>
        )}
        {pad?.notice && <p className="muted">{pad.notice}</p>}
      </div>
      <div className="pad-volume-card">
        <div className="pad-volume-head">
          <span>Volume</span>
          <span className="pad-volume-value">{Math.round(volume * 100)}%</span>
        </div>
        {pad && <PadVolume volume={volume} onChange={pad.setVolume} />}
        <p className="muted">Fica salvo neste aparelho.</p>
      </div>
      {sequence.length > 0 && (
        <div className="pad-sequence">
          <h2 className="section-title">No repertório · tons</h2>
          <ol className="pad-sequence-list">
            {sequence.map((note, index) => (
              <li
                key={`${index}-${note}`}
                className={playing && note === pad?.note ? 'is-current' : undefined}
              >
                {note}
              </li>
            ))}
          </ol>
        </div>
      )}
      {playing && owner && pad && (
        <button
          type="button"
          className="btn pad-stop"
          onClick={() => pad.toggle(pad.note ?? 'C', owner)}
        >
          Parar pad
        </button>
      )}
    </section>
  );
}

import { useSongsContext } from '../catalog/SongsProvider';
import { shortDate } from '../setlists/format';
import { useSetlistsContext } from '../setlists/SetlistsProvider';
import { ScreenHeader } from '../ui/ScreenHeader';
import { PAD_NOTES, padNoteFor, type PadNote } from './padNotes';
import type { PadOwner } from './padRoute';
import { PadVolume } from './PadVolume';
import { usePad } from './usePad';

const FREE_OWNER: PadOwner = { kind: 'free' };

/**
 * Status, tones and volume of the pad. The tone grid starts the pad from this tab (owner "free")
 * or, while it plays, crossfades to another tone without changing the owner.
 */
export function PadPage() {
  const pad = usePad();
  const { songs } = useSongsContext();
  const { setlists } = useSetlistsContext();
  const volume = pad?.volume ?? 0.6;
  const playing = pad?.status === 'playing' || pad?.status === 'loading';

  const onTone = (tone: PadNote) => {
    if (!pad) return;
    if (pad.status === 'playing' && pad.note !== tone) pad.follow(tone);
    else pad.toggle(tone, FREE_OWNER);
  };

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
        <p className="muted pad-hint">
          Toque em um tom para tocar. Com o pad ligado, toque em outro tom para trocar com transição
          suave.
        </p>
        {pad?.notice && <p className="muted">{pad.notice}</p>}
      </div>
      {pad && (
        <div className="pad-tones" role="group" aria-label="Tons do pad">
          {PAD_NOTES.map((tone) => {
            const current = pad.status === 'playing' && pad.note === tone;
            return (
              <button
                key={tone}
                type="button"
                className={current ? 'pad-tone is-current' : 'pad-tone'}
                aria-pressed={current}
                onClick={() => onTone(tone)}
              >
                {tone}
              </button>
            );
          })}
        </div>
      )}
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

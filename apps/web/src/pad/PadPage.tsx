import type { CSSProperties } from 'react';
import { useSongsContext } from '../catalog/SongsProvider';
import { shortDate } from '../setlists/format';
import { useSetlistsContext } from '../setlists/SetlistsProvider';
import { ScreenHeader } from '../ui/ScreenHeader';
import { PAD_NOTES, padNoteFor, type PadNote } from './padNotes';
import type { PadOwner } from './padRoute';
import { PadVolume } from './PadVolume';
import { usePad } from './usePad';

/** Paper spelling of the tones (the pad itself keeps sharps). */
const TONE_LABEL: Record<PadNote, string> = {
  C: 'C',
  'C#': 'C#',
  D: 'D',
  'D#': 'Eb',
  E: 'E',
  F: 'F',
  'F#': 'F#',
  G: 'G',
  'G#': 'Ab',
  A: 'A',
  'A#': 'Bb',
  B: 'B',
};

const TONE_ORDER: readonly PadNote[] = PAD_NOTES;

const EQ_BARS = [10, 18, 24, 16, 8];

const FREE_OWNER: PadOwner = { kind: 'free' };

const IDLE_HINT = 'Toque em um tom para tocar';

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
  const playingContext = playing
    ? song
      ? `${song.title} · ${song.artistName}`
      : setlist
        ? `${setlist.label} · ${shortDate(setlist.date)}`
        : null
    : null;
  // One line under the title keeps the card the same size off and playing: a failure notice
  // wins, then what is playing, then (only while off) how to start.
  const context = pad?.notice ?? playingContext ?? (playing ? null : IDLE_HINT);
  const sequence: string[] = setlist
    ? setlist.items.map((item) => padNoteFor(item.key) ?? item.key)
    : [];

  let title = 'Pad desligado';
  if (pad?.status === 'loading') title = 'Carregando pad…';
  else if (pad?.status === 'playing')
    title = `Tocando em ${TONE_LABEL[pad.note as PadNote] ?? pad.note ?? ''}`.trim();
  else if (pad?.status === 'error') title = 'Pad indisponível';

  return (
    <section>
      <ScreenHeader eyebrow="Fundo musical" title="Pad" />
      <div className={playing ? 'pad-card is-playing' : 'pad-card'}>
        <div className="pad-card-row">
          <span className="pad-eq" aria-hidden="true">
            {EQ_BARS.map((height) => (
              <span key={height} style={{ height }} />
            ))}
          </span>
          <div className="pad-card-text">
            <p role="status" className="pad-title">
              {title}
            </p>
            {context && <p className="pad-context">{context}</p>}
          </div>
          {playing && owner && pad && (
            <button
              type="button"
              className="pad-stop"
              onClick={() => pad.toggle(pad.note ?? 'C', owner)}
            >
              Parar
            </button>
          )}
        </div>
        <div
          className="pad-volume"
          style={{ '--pad-volume': `${Math.round(volume * 100)}%` } as CSSProperties}
        >
          <div className="pad-volume-head">
            <span>Volume</span>
            <span className="pad-volume-value">{Math.round(volume * 100)}%</span>
          </div>
          {pad && <PadVolume volume={volume} onChange={pad.setVolume} />}
        </div>
      </div>
      {pad && (
        <>
          <h2 className="pad-label">Tons · toque para trocar</h2>
          <div className="pad-tones" role="group" aria-label="Tons do pad">
            {TONE_ORDER.map((tone) => {
              const current = pad.status === 'playing' && pad.note === tone;
              const saved = !current && pad.cachedNotes.has(tone);
              return (
                <button
                  key={tone}
                  type="button"
                  className={
                    current ? 'pad-tone is-current' : saved ? 'pad-tone is-cached' : 'pad-tone'
                  }
                  aria-pressed={current}
                  aria-label={`Tocar tom ${TONE_LABEL[tone]}`}
                  onClick={() => onTone(tone)}
                >
                  <span className="pad-tone-name">{TONE_LABEL[tone]}</span>
                  {current && <span className="pad-tone-tag">ATIVO</span>}
                  {current && <span className="pad-tone-dot" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </>
      )}
      {sequence.length > 0 && (
        <div className="pad-sequence">
          <h2 className="pad-label">No repertório · tons</h2>
          <ol className="pad-sequence-list">
            {sequence.map((note, index) => (
              <li
                key={`${index}-${note}`}
                className={playing && note === pad?.note ? 'is-current' : undefined}
              >
                {TONE_LABEL[note as PadNote] ?? note}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

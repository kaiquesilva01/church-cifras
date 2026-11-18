import { Link } from 'react-router';
import type { SongSummary } from '../catalog/types';
import { shortDate, songCount } from './format';
import { groupSetlists } from './selectors';
import type { Setlist } from './types';

const PREVIEW_ITEMS = 4;

function Section({
  title,
  status,
  setlists,
  songs,
}: {
  title: string;
  /** Badge of every card in the section. */
  status: 'upcoming' | 'past';
  setlists: Setlist[];
  /** `null` while the catalog is not ready: the cards then show no preview. */
  songs: ReadonlyMap<string, SongSummary> | null;
}) {
  if (setlists.length === 0) return null;
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      <ul className="list">
        {setlists.map((s) => {
          // Only the soonest date (the next culto) is "Próximo"; later ones are just scheduled.
          const label =
            status === 'past' ? 'Realizado' : s.date === setlists[0]?.date ? 'Próximo' : 'Agendado';
          const shown = s.items.slice(0, PREVIEW_ITEMS);
          const more = s.items.length - shown.length;
          return (
            <li key={s.id} className="list-card setlist-card">
              <span className={label === 'Próximo' ? 'status-pill is-next' : 'status-pill'}>
                {label}
              </span>
              <Link to={`/repertorios/${s.id}`} className="list-main setlist-row">
                <span className="song-title">
                  {s.label} · {shortDate(s.date)}
                </span>
                <span className="muted">{songCount(s)} ›</span>
              </Link>
              {songs && shown.length > 0 && (
                <ul className="setlist-tracks" aria-label={`Louvores de ${s.label}`}>
                  {shown.map((item) => {
                    const song = songs.get(item.songId);
                    // Same rule as the detail page: a key the song no longer has is struck through.
                    const keyGone = song !== undefined && !song.keys.includes(item.key);
                    return (
                      <li key={item.id}>
                        <span className="key-tag">
                          {keyGone ? <s>{item.key}</s> : item.key}
                          {keyGone && <span className="sr-only"> (tom indisponível)</span>}
                        </span>
                        <span className="setlist-track-title">
                          {song?.title ?? 'Música removida'}
                        </span>
                      </li>
                    );
                  })}
                  {more > 0 && <li className="muted">+ {more}</li>}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SetlistsTab({
  setlists,
  today,
  now,
  songs,
}: {
  setlists: Setlist[];
  today: string;
  now: Date;
  /** Catalog, to name the first songs on each card; omit it (still loading) to show no preview. */
  songs?: SongSummary[];
}) {
  const { upcoming, recent } = groupSetlists(setlists, today, now);
  if (upcoming.length === 0 && recent.length === 0) {
    return <p className="status">Nenhum repertório ainda.</p>;
  }
  const byId = songs ? new Map(songs.map((song) => [song.id, song])) : null;
  return (
    <>
      <Section title="Próximos" status="upcoming" setlists={upcoming} songs={byId} />
      <Section title="Recentes" status="past" setlists={recent} songs={byId} />
    </>
  );
}

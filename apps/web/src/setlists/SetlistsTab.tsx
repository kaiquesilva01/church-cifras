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
  status: 'Próximo' | 'Realizado';
  setlists: Setlist[];
  songs: ReadonlyMap<string, SongSummary>;
}) {
  if (setlists.length === 0) return null;
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      <ul className="list">
        {setlists.map((s) => {
          const shown = s.items.slice(0, PREVIEW_ITEMS);
          const more = s.items.length - shown.length;
          return (
            <li key={s.id} className="list-card setlist-card">
              <span className={status === 'Próximo' ? 'status-pill is-next' : 'status-pill'}>
                {status}
              </span>
              <Link to={`/repertorios/${s.id}`} className="list-main setlist-row">
                <span className="song-title">
                  {s.label} · {shortDate(s.date)}
                </span>
                <span className="muted">{songCount(s)} ›</span>
              </Link>
              {shown.length > 0 && (
                <ul className="setlist-tracks" aria-label={`Louvores de ${s.label}`}>
                  {shown.map((item) => (
                    <li key={item.id}>
                      <span className="key-tag">{item.key}</span>
                      <span>{songs.get(item.songId)?.title ?? 'Música removida'}</span>
                    </li>
                  ))}
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
  songs = [],
}: {
  setlists: Setlist[];
  today: string;
  now: Date;
  /** Catalog, to name the first songs on each card; without it they read "Música removida". */
  songs?: SongSummary[];
}) {
  const { upcoming, recent } = groupSetlists(setlists, today, now);
  if (upcoming.length === 0 && recent.length === 0) {
    return <p className="status">Nenhum repertório ainda.</p>;
  }
  const byId = new Map(songs.map((song) => [song.id, song]));
  return (
    <>
      <Section title="Próximos" status="Próximo" setlists={upcoming} songs={byId} />
      <Section title="Recentes" status="Realizado" setlists={recent} songs={byId} />
    </>
  );
}

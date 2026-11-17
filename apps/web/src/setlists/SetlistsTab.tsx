import { Link } from 'react-router';
import { shortDate, songCount } from './format';
import { groupSetlists } from './selectors';
import type { Setlist } from './types';

function Section({ title, setlists }: { title: string; setlists: Setlist[] }) {
  if (setlists.length === 0) return null;
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      <ul className="list">
        {setlists.map((s) => (
          <li key={s.id} className="list-card">
            <Link to={`/repertorios/${s.id}`} className="list-main setlist-row">
              <span className="song-title">
                {s.label} · {shortDate(s.date)}
              </span>
              <span className="muted">{songCount(s)} ›</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SetlistsTab({
  setlists,
  today,
  now,
}: {
  setlists: Setlist[];
  today: string;
  now: Date;
}) {
  const { upcoming, recent } = groupSetlists(setlists, today, now);
  if (upcoming.length === 0 && recent.length === 0) {
    return <p className="status">Nenhum repertório ainda.</p>;
  }
  return (
    <>
      <Section title="Próximos" setlists={upcoming} />
      <Section title="Recentes" setlists={recent} />
    </>
  );
}

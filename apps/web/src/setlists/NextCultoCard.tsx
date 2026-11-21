import { Link } from 'react-router';
import { shortDate, songCount } from './format';
import { RehearsalLine } from './RehearsalLine';
import { nextCultos } from './selectors';
import type { Setlist } from './types';

export function NextCultoCard({
  setlists,
  today,
  now,
}: {
  setlists: Setlist[];
  today: string;
  now: Date;
}) {
  const next = nextCultos(setlists, today, now);
  if (next.length === 0) return null;
  return (
    <section className="next-culto" aria-labelledby="next-culto-title">
      <h2 id="next-culto-title" className="next-culto-title">
        Próximo culto
      </h2>
      <ul className="list">
        {next.map((s) => (
          <li key={s.id} className="list-card">
            <Link to={`/repertorios/${s.id}`} className="list-main setlist-row">
              <span className="song-title">
                {s.label} · {shortDate(s.date)}
              </span>
              <span className="muted">{songCount(s)} ›</span>
            </Link>
            <RehearsalLine rehearsalAt={s.rehearsalAt} now={now} muted />
          </li>
        ))}
      </ul>
    </section>
  );
}

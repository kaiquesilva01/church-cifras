import { keySlug, type KeyName } from '@cifras/chords';
import { Link } from 'react-router';

export function KeyChips({
  songId,
  title,
  keys,
  selected,
  replace,
  extraQuery,
}: {
  songId: string;
  title: string;
  keys: KeyName[];
  selected?: KeyName;
  replace?: boolean;
  /** Extra `a=b&c=d` appended to the `?tom=` link (e.g. the setlist context). */
  extraQuery?: string;
}) {
  if (keys.length === 0) return null;
  return (
    <ul className="chips">
      {keys.map((key) => (
        <li key={key}>
          <Link
            to={`/musicas/${songId}?tom=${keySlug(key)}${extraQuery ? `&${extraQuery}` : ''}`}
            className="chip"
            replace={replace}
            aria-label={`${title}, tom ${key}`}
            aria-current={key === selected ? 'true' : undefined}
          >
            {key}
          </Link>
        </li>
      ))}
    </ul>
  );
}

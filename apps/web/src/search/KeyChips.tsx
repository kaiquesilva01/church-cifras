import { keySlug, type KeyName } from '@cifras/chords';
import { Link } from 'react-router';

export function KeyChips({
  songId,
  title,
  keys,
  selected,
  replace,
}: {
  songId: string;
  title: string;
  keys: KeyName[];
  selected?: KeyName;
  replace?: boolean;
}) {
  if (keys.length === 0) return null;
  return (
    <ul className="chips">
      {keys.map((key) => (
        <li key={key}>
          <Link
            to={`/musicas/${songId}?tom=${keySlug(key)}`}
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

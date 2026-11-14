import { keySlug, type KeyName } from '@cifras/chords';
import { Link } from 'react-router';

export function KeyChips({
  songId,
  keys,
  selected,
}: {
  songId: string;
  keys: KeyName[];
  selected?: KeyName;
}) {
  if (keys.length === 0) return null;
  return (
    <ul className="chips">
      {keys.map((key) => (
        <li key={key}>
          <Link
            to={`/musicas/${songId}?tom=${keySlug(key)}`}
            className="chip"
            aria-current={key === selected ? 'true' : undefined}
          >
            {key}
          </Link>
        </li>
      ))}
    </ul>
  );
}

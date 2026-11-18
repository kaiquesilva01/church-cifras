import { keySlug, type KeyName } from '@cifras/chords';
import { Link } from 'react-router';

export function KeyChips({
  songId,
  title,
  keys,
  selected,
  replace,
  extraQuery,
  compact,
}: {
  songId: string;
  title: string;
  keys: KeyName[];
  selected?: KeyName;
  replace?: boolean;
  /** Extra `a=b&c=d` appended to the `?tom=` link (e.g. the setlist context). */
  extraQuery?: string;
  /** Small pills for the song lists (the row itself is the main tap target). */
  compact?: boolean;
}) {
  if (keys.length === 0) return null;
  return (
    <ul className={compact ? 'chips chips-compact' : 'chips'}>
      {keys.map((key) => (
        <li key={key}>
          <Link
            to={`/musicas/${songId}?tom=${keySlug(key)}${extraQuery ? `&${extraQuery}` : ''}`}
            className={compact && key === selected ? 'chip is-default' : 'chip'}
            replace={replace}
            aria-label={`${title}, tom ${key}`}
            // In the lists the highlighted pill is only the default key, not the current page.
            aria-current={!compact && key === selected ? 'true' : undefined}
          >
            {key}
          </Link>
        </li>
      ))}
    </ul>
  );
}

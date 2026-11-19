import { Link } from 'react-router';
import type { SongSummary } from '../catalog/types';
import { CloseIcon, OpenChevronIcon } from './icons';
import { itemHref } from './navigation';
import type { RowDrag } from './SortableItems';
import type { SetlistItem } from './types';

export interface SetlistItemRowProps {
  setlistId: string;
  item: SetlistItem;
  /** `undefined` quando a música não existe mais no catálogo. */
  song: SongSummary | undefined;
  position: number;
  editable: boolean;
  onRemove: () => void;
  onPickKey: () => void;
  /** Presente só para quem edita: ref/estilo do `li` e a alça `≡`. */
  drag?: RowDrag;
}

export function SetlistItemRow({
  setlistId,
  item,
  song,
  position,
  editable,
  onRemove,
  onPickKey,
  drag,
}: SetlistItemRowProps) {
  const title = song?.title ?? 'Música removida';
  // O tom salvo deixou de existir entre os tons da música: aparece riscado.
  const keyGone = song !== undefined && !song.keys.includes(item.key);
  const keyLabel = keyGone ? <s>{item.key}</s> : item.key;

  return (
    <li
      className={`list-card setlist-item${song === undefined ? ' setlist-item-missing' : ''}`}
      ref={drag?.setNodeRef}
      style={drag?.style}
    >
      {drag?.handle(title)}
      <span className="setlist-item-number muted">{position}</span>
      <span className="setlist-item-main">
        {song ? (
          <Link to={itemHref(setlistId, item)} className="song-title setlist-item-link">
            <span className="setlist-item-name">{song.title}</span>
            <OpenChevronIcon />
          </Link>
        ) : (
          <span className="song-title">{title}</span>
        )}
        {song && <span className="setlist-item-artist">{song.artistName}</span>}
        {keyGone && <span className="setlist-item-warn">Tom {item.key} removido</span>}
      </span>
      {song === undefined ? (
        <span className="setlist-item-key muted" aria-hidden="true">
          ✕
        </span>
      ) : editable ? (
        <button
          type="button"
          className="btn setlist-item-key"
          aria-label={`Tom ${item.key}${keyGone ? ' (indisponível)' : ''}, alterar`}
          onClick={onPickKey}
        >
          {keyLabel}
        </button>
      ) : (
        <span className="setlist-item-key">
          {keyLabel}
          {keyGone && <span className="sr-only"> (tom indisponível)</span>}
        </span>
      )}
      {editable && (
        <span className="setlist-item-actions">
          <button
            type="button"
            className="btn btn-icon"
            aria-label={`Remover ${title}`}
            onClick={onRemove}
          >
            <CloseIcon />
          </button>
        </span>
      )}
    </li>
  );
}

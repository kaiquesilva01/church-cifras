import { Link } from 'react-router';
import type { ItemNav } from './navigation';
import type { SetlistItem } from './types';

export interface SetlistBarProps {
  nav: ItemNav;
  onGo: (item: SetlistItem) => void;
  /** Para onde "Voltar ao repertório" leva. */
  backHref: string;
}

/** ‹ Anterior · 2 de 5 · Próxima ›, ou "Fora do repertório" quando o item aberto saiu da lista. */
export function SetlistBar({ nav, onGo, backHref }: SetlistBarProps) {
  if (!nav.inList) {
    return (
      <nav className="setlist-bar" aria-label="Repertório">
        <span>Fora do repertório</span>
        <Link to={backHref}>Voltar ao repertório</Link>
      </nav>
    );
  }
  return (
    <nav className="setlist-bar" aria-label="Repertório">
      <button
        type="button"
        className="btn"
        disabled={!nav.prev}
        onClick={() => nav.prev && onGo(nav.prev)}
      >
        <span aria-hidden="true">‹ </span>Anterior
      </button>
      <span>{`${nav.position} de ${nav.total}`}</span>
      <button
        type="button"
        className="btn"
        disabled={!nav.next}
        onClick={() => nav.next && onGo(nav.next)}
      >
        Próxima<span aria-hidden="true"> ›</span>
      </button>
    </nav>
  );
}

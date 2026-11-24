import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { BackChevronIcon, LayersIcon } from './icons';

/** Tela 49: o id não existe no ministério atual da pessoa (ou foi removido). */
export function SetlistNotFound() {
  const navigate = useNavigate();
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  return (
    <section className="setlist-not-found">
      <Link to="/?aba=repertorios" className="back">
        <BackChevronIcon />
        Voltar
      </Link>
      <div className="empty-card empty-card--search setlist-not-found-body">
        <span className="setlist-not-found-icon" aria-hidden="true">
          <LayersIcon />
        </span>
        <h1 ref={titleRef} tabIndex={-1}>
          Repertório não encontrado
        </h1>
        <p>
          Esse repertório não existe no seu ministério ou foi removido. Confira o link com quem
          compartilhou.
        </p>
        <button type="button" className="btn-primary" onClick={() => navigate('/?aba=repertorios')}>
          Ver repertórios
        </button>
      </div>
    </section>
  );
}

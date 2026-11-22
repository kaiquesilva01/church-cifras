import { useContext } from 'react';
import { Link } from 'react-router';
import { ROLE_LABELS, canEdit, isAdmin } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import { AvisosRow } from '../push/AvisosRow';
import { PushContext } from '../push/types';
import { initialsOf } from '../ui/initials';
import { ScreenHeader } from '../ui/ScreenHeader';

const CHEVRON = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    aria-hidden="true"
  >
    <polyline points="9 18 15 12 9 6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span className="menu-icon" aria-hidden="true">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </span>
  );
}

export function MaisPage() {
  const { user, role, signOut } = useAuth();
  const push = useContext(PushContext);
  const name = user?.displayName ?? user?.email ?? '';
  return (
    <section>
      <ScreenHeader eyebrow="Conta" title="Mais" />
      <div className="profile-card">
        <span className="profile-avatar" aria-hidden="true">
          {initialsOf(name)}
        </span>
        <div className="profile-info">
          {user?.displayName && <p className="profile-name">{user.displayName}</p>}
          <p className="muted">{user?.email}</p>
          <span className="role-badge">{ROLE_LABELS[role]}</span>
        </div>
      </div>
      <ul className="menu-card">
        {isAdmin(role) && (
          <li>
            <Link to="/pessoas" className="menu-row">
              <Icon>
                <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" />
              </Icon>
              <span className="menu-text">
                <strong>Admin</strong>
                <span className="muted">Pessoas e papéis do sistema</span>
              </span>
              {CHEVRON}
            </Link>
          </li>
        )}
        {push && canEdit(role) && <AvisosRow service={push} />}
        <li>
          <div className="menu-row is-soon" aria-disabled="true">
            <Icon>
              <circle cx="9" cy="8" r="3.5" />
              <path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .8 3.2 2.6 3.5 5.2" />
            </Icon>
            <span className="menu-text">
              <strong>Pessoas</strong>
              <span className="muted">Músicos, vocais, instrumentos e disponibilidade</span>
            </span>
            <span className="soon-pill">Em breve</span>
          </div>
        </li>
        {isAdmin(role) && (
          <li>
            <Link to="/importar" className="menu-row">
              <Icon>
                <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 20h14" />
              </Icon>
              <span className="menu-text">
                <strong>Importar</strong>
                <span className="muted">Importar várias cifras em PDF de uma vez</span>
              </span>
              {CHEVRON}
            </Link>
          </li>
        )}
        {isAdmin(role) && (
          <li>
            <Link to="/estatisticas" className="menu-row">
              <Icon>
                <path d="M5 20v-9M12 20V4M19 20v-6" />
              </Icon>
              <span className="menu-text">
                <strong>Estatísticas</strong>
                <span className="muted">PDFs, espaço e cifras mais usadas</span>
              </span>
              {CHEVRON}
            </Link>
          </li>
        )}
        <li>
          <button type="button" className="menu-row menu-row-danger" onClick={() => void signOut()}>
            <span className="menu-icon menu-icon-danger" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </span>
            <span className="menu-text">
              <strong>Sair</strong>
              <span className="muted">Encerrar sessão neste dispositivo</span>
            </span>
          </button>
        </li>
      </ul>
    </section>
  );
}

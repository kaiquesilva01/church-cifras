import { useContext, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { canUpload, isMinistryAdmin, isMinistryLoading } from '../auth/permissions';
import { useAuth } from '../auth/useAuth';
import type { MinistriesApi } from '../ministries/ministriesApi';
import { AvisosRow } from '../push/AvisosRow';
import { PushContext } from '../push/types';
import { MinistryLoadError } from '../routes/MinistryLoadError';
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

function Icon({ children }: { children: ReactNode }) {
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

/** Texto do contador para leitor de tela: "1 pedido pendente", "N pedidos pendentes". */
const pendentes = (n: number) => (n === 1 ? '1 pedido pendente' : `${n} pedidos pendentes`);
/** Texto visível do contador: acima de 99, "99+" (inferido do Paper). */
const badgeText = (n: number) => (n > 99 ? '99+' : String(n));

interface MenuLinkProps {
  to: string;
  icon: ReactNode;
  title: string;
  hint: string;
  /** Pedidos pendentes; sem contador quando zero (ou ausente). */
  pending?: number;
}

function MenuLink({ to, icon, title, hint, pending = 0 }: MenuLinkProps) {
  const label = pending > 0 ? `${title}, ${pendentes(pending)}` : undefined;
  return (
    <li>
      <Link to={to} className="menu-row" aria-label={label}>
        <Icon>{icon}</Icon>
        <span className="menu-text">
          <strong>{title}</strong>
          <span className="muted">{hint}</span>
        </span>
        {pending > 0 && (
          <span className="count-badge" aria-hidden="true">
            {badgeText(pending)}
          </span>
        )}
        {CHEVRON}
      </Link>
    </li>
  );
}

/** Contadores de pedidos: só consultados para quem vê a linha correspondente. Falha conta como zero. */
function usePendingCounts(
  api: MinistriesApi,
  ministryId: string | undefined,
  showMinistry: boolean,
  showApp: boolean,
) {
  const [ministryCount, setMinistryCount] = useState(0);
  const [appCount, setAppCount] = useState(0);

  useEffect(() => {
    if (!showMinistry || !ministryId) return;
    let live = true;
    api.countPending(ministryId).then(
      (n) => {
        if (live) setMinistryCount(n);
      },
      () => {
        if (live) setMinistryCount(0);
      },
    );
    return () => {
      live = false;
    };
  }, [api, ministryId, showMinistry]);

  useEffect(() => {
    if (!showApp) return;
    let live = true;
    api.countPendingAll().then(
      (n) => {
        if (live) setAppCount(n);
      },
      () => {
        if (live) setAppCount(0);
      },
    );
    return () => {
      live = false;
    };
  }, [api, showApp]);

  return { ministryCount, appCount };
}

function MenuCard({ eyebrow, children }: { eyebrow?: string; children: ReactNode }) {
  return (
    <>
      {eyebrow && <p className="section-eyebrow">{eyebrow}</p>}
      <ul className="menu-card">{children}</ul>
    </>
  );
}

export function MaisPage({ api }: { api: MinistriesApi }) {
  const auth = useAuth();
  const { user, signOut, ministry, appAdmin } = auth;
  const push = useContext(PushContext);
  const loading = isMinistryLoading(auth);
  const ministryAdmin = isMinistryAdmin(auth);
  const { ministryCount, appCount } = usePendingCounts(api, ministry?.id, ministryAdmin, appAdmin);
  const name = user?.displayName ?? user?.email ?? '';
  // Com as duas visões (app e ministério), cada grupo ganha o seu eyebrow, como no Paper (tela 40).
  const bothViews = appAdmin && ministry !== null;

  const pills: ReactNode[] = [];
  if (appAdmin) {
    pills.push(
      <span key="app" className="role-badge role-badge--app">
        Admin da app
      </span>,
    );
  }
  if (ministry) {
    const role = ministry.role === 'admin' ? 'admin' : 'member';
    pills.push(
      <span key="ministry" className={`role-badge role-badge--${role}`}>
        {`${ministry.name} · ${role === 'admin' ? 'Admin' : 'Membro'}`}
      </span>,
    );
  }

  const ministryRows = ministry && ministryAdmin && (
    <>
      <MenuLink
        to="/pessoas"
        icon={
          <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 19v-1.5a3.5 3.5 0 0 0-2.5-3.4M15 4.6a3.5 3.5 0 0 1 0 6.8" />
        }
        title="Pessoas do ministério"
        hint={`Pedidos de entrada e membros da ${ministry.name}`}
        pending={ministryCount}
      />
      <MenuLink
        to="/estatisticas"
        icon={<path d="M5 20v-9M12 20V4M19 20v-6" />}
        title="Estatísticas do ministério"
        hint={`Cifras mais usadas nos repertórios da ${ministry.name}`}
      />
      {canUpload(auth) && (
        <MenuLink
          to="/importar"
          icon={<path d="M12 3v12m0 0l-4-4m4 4l4-4M5 20h14" />}
          title="Importar"
          hint="Importar várias cifras em PDF de uma vez"
        />
      )}
    </>
  );

  const commonRows = (
    <>
      {push && ministry !== null && <AvisosRow service={push} />}
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
    </>
  );

  return (
    <section aria-busy={loading || undefined}>
      <ScreenHeader eyebrow="Conta" title="Mais" />
      <div className="mn-profile-card">
        <span className="mn-profile-avatar" aria-hidden="true">
          {initialsOf(name)}
        </span>
        <div className="mn-profile-info">
          {user?.displayName && <p className="mn-profile-name">{user.displayName}</p>}
          <p className="mn-profile-email muted">{user?.email}</p>
          {pills.length > 0 && <div className="mn-role-pills">{pills}</div>}
          {auth.ministryFailed && <MinistryLoadError missing={auth.ministryMissing} />}
        </div>
      </div>
      {appAdmin && (
        <MenuCard eyebrow={bothViews ? 'Aplicativo' : undefined}>
          <MenuLink
            to="/gestao"
            icon={<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" />}
            title="Gestão"
            hint="Pedidos, ministérios e estatísticas da app"
            pending={appCount}
          />
        </MenuCard>
      )}
      {bothViews ? (
        <>
          {ministryRows && <MenuCard eyebrow={ministry?.name}>{ministryRows}</MenuCard>}
          <MenuCard>{commonRows}</MenuCard>
        </>
      ) : (
        <MenuCard>
          {ministryRows}
          {commonRows}
        </MenuCard>
      )}
    </section>
  );
}

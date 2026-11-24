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
  /** Pedidos pendentes. `null` (desconhecido, ainda carregando ou falhou) não mostra contador. */
  pending?: number | null;
}

function MenuLink({ to, icon, title, hint, pending = null }: MenuLinkProps) {
  const count = pending ?? 0;
  const label = count > 0 ? `${title}, ${pendentes(count)}` : undefined;
  return (
    <li>
      <Link to={to} className="menu-row" aria-label={label}>
        <Icon>{icon}</Icon>
        <span className="menu-text">
          <strong>{title}</strong>
          <span className="muted">{hint}</span>
        </span>
        {count > 0 && (
          <span className="count-badge" aria-hidden="true">
            {badgeText(count)}
          </span>
        )}
        {CHEVRON}
      </Link>
    </li>
  );
}

/** Contagem com a chave (ministério ou "app") a que pertence: resultado de outro ministério não vale. */
interface Counted {
  key: string;
  n: number | null;
}

const APP_KEY = 'app';
/** Espera antes da segunda tentativa de contar (falha transitória de rede). */
const RETRY_DELAY_MS = 1500;

/**
 * Conta com uma nova tentativa depois de `RETRY_DELAY_MS`. Falha de novo: `done(null)`, desconhecido.
 * Devolve o cancelamento (desmontagem ou troca de chave).
 */
function countWithRetry(load: () => Promise<number>, done: (n: number | null) => void): () => void {
  let live = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ask = (retry: boolean) => {
    load().then(
      (n) => {
        if (live) done(n);
      },
      () => {
        if (!live) return;
        if (retry) timer = setTimeout(() => ask(false), RETRY_DELAY_MS);
        else done(null);
      },
    );
  };
  ask(true);
  return () => {
    live = false;
    clearTimeout(timer);
  };
}

/**
 * Contadores de pedidos, só para quem vê a linha correspondente. Falha tenta de novo uma vez; se
 * falhar de novo, o contador fica desconhecido (`null`): sem badge e sem zero na tela.
 * O resultado guarda a chave a que pertence: ao trocar de ministério, o valor antigo deixa de valer
 * na hora, sem flash.
 */
function usePendingCounts(
  api: MinistriesApi,
  ministryId: string | undefined,
  showMinistry: boolean,
  showApp: boolean,
) {
  const [ministry, setMinistry] = useState<Counted>({ key: '', n: null });
  const [app, setApp] = useState<Counted>({ key: '', n: null });

  useEffect(() => {
    if (!showMinistry || !ministryId) return;
    return countWithRetry(
      () => api.countPending(ministryId),
      (n) => setMinistry({ key: ministryId, n }),
    );
  }, [api, ministryId, showMinistry]);

  useEffect(() => {
    if (!showApp) return;
    return countWithRetry(
      () => api.countPendingAll(),
      (n) => setApp({ key: APP_KEY, n }),
    );
  }, [api, showApp]);

  return {
    ministryCount: showMinistry && ministryId && ministry.key === ministryId ? ministry.n : null,
    appCount: showApp && app.key === APP_KEY ? app.n : null,
  };
}

function MenuCard({
  eyebrow,
  placeholder = false,
  children,
}: {
  eyebrow?: string;
  /** Eyebrow ainda não conhecido (ministério carregando): reserva a mesma altura, sem texto. */
  placeholder?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {eyebrow && <p className="section-eyebrow">{eyebrow}</p>}
      {placeholder && (
        <div className="section-eyebrow" aria-hidden="true">
          <span className="skeleton mn-skeleton-eyebrow" />
        </div>
      )}
      <ul className="menu-card">{children}</ul>
    </>
  );
}

/** Linha em esqueleto enquanto o ministério carrega; o texto oculto é anunciado a leitor de tela. */
function MinistrySkeleton() {
  return (
    <li>
      <span className="sr-only" role="status">
        Carregando…
      </span>
      <div className="menu-row mn-skeleton-row" aria-hidden="true">
        <span className="skeleton skeleton-tile" />
        <span className="mn-skeleton-text">
          <span className="skeleton skeleton-title" style={{ width: '120px' }} />
          <span className="skeleton skeleton-line" style={{ width: '72px' }} />
        </span>
      </div>
    </li>
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
  // Admin da app sempre tem a moldura de duas visões (eyebrow "Aplicativo" e cartão da Gestão), com
  // ou sem ministério, para o quadro não pular ao carregar (Paper, tela 40).
  const splitViews = appAdmin;

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
        <MenuCard eyebrow={splitViews ? 'Aplicativo' : undefined}>
          <MenuLink
            to="/gestao"
            icon={<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6l8-3z" />}
            title="Gestão"
            hint="Pedidos, ministérios e estatísticas da app"
            pending={appCount}
          />
        </MenuCard>
      )}
      {loading ? (
        splitViews ? (
          <>
            <MenuCard placeholder>
              <MinistrySkeleton />
            </MenuCard>
            <MenuCard>{commonRows}</MenuCard>
          </>
        ) : (
          <MenuCard>
            <MinistrySkeleton />
            {commonRows}
          </MenuCard>
        )
      ) : splitViews ? (
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

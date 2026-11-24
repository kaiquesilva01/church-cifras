import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { MinistryRole } from '../auth/useAuth';
import { messageFor } from '../ministries/callable';
import type { MinistriesApi, PersonRow } from '../ministries/ministriesApi';
import { ConfirmDialog } from '../viewer/ConfirmDialog';
import { initialsOf } from '../ui/initials';

export interface PeoplePageProps {
  api: MinistriesApi;
  ministryId: string;
  ministryName: string;
  /** Visão do admin do ministério: a própria linha vira "(você)", vai para o topo e não pode ser alterada. */
  selfUid?: string;
  /** Visão do admin da app (Gestão): sem "(você)"; o último admin pode ser alterado. */
  appAdminView: boolean;
}

type Action = {
  kind: 'approve' | 'reject' | 'role' | 'remove';
  person: PersonRow;
  role?: MinistryRole;
};

const LOAD_ERROR = 'Não foi possível carregar. Tente de novo.';
const ROLE_LABEL: Record<MinistryRole, string> = { member: 'Membro', admin: 'Admin' };
const LAST_ADMIN_NOTE =
  'Todo ministério precisa de pelo menos um admin. Só o admin da app pode remover o último.';

function nameOf(person: PersonRow): string {
  return person.displayName ?? person.email ?? 'Pessoa';
}

function requestedOn(date: Date | null | undefined): string | null {
  if (!date) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Pediu em ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

function Skeleton() {
  return (
    <ul className="person-list" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="person-row">
          <span className="skeleton skeleton-avatar" aria-hidden="true" />
          <span className="person-row-text" aria-hidden="true">
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-line" />
          </span>
          <span className="skeleton skeleton-pill" aria-hidden="true" />
        </li>
      ))}
      <li className="sr-only">Carregando…</li>
    </ul>
  );
}

/**
 * Pessoas do ministério (tela 41): pedidos pendentes e membros, com as ações do admin.
 * Ao trocar de `ministryId` a tela remonta (chave), então nenhum estado local vaza para outro ministério.
 */
export function PeoplePage(props: PeoplePageProps) {
  return <PeopleScreen key={props.ministryId} {...props} />;
}

function PeopleScreen({ api, ministryId, ministryName, selfUid, appAdminView }: PeoplePageProps) {
  const [data, setData] = useState<{ requests: PersonRow[]; members: PersonRow[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<{ message: string; retry: Action } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [menuUid, setMenuUid] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{
    person: PersonRow;
    opener: HTMLElement | null;
  } | null>(null);
  // `attempt` sobe para reler as listas (depois de uma ação ou em "Tentar de novo").
  const [attempt, setAttempt] = useState(0);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const openAnchor = useRef<HTMLLIElement | null>(null);
  const membersHeading = useRef<HTMLHeadingElement>(null);
  const focusMembersOnLoad = useRef(false);

  const reload = useCallback(() => {
    setLoadError(false);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([api.listRequests(ministryId), api.listMembers(ministryId)])
      .then(([requests, members]) => {
        if (active) setData({ requests, members });
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [api, ministryId, attempt]);

  // Depois de remover, o foco vai para o título "Membros" (a linha removida sumiu).
  useEffect(() => {
    if (data && focusMembersOnLoad.current) {
      focusMembersOnLoad.current = false;
      membersHeading.current?.focus();
    }
  }, [data]);

  const run = useCallback(
    async (action: Action) => {
      const uid = action.person.uid;
      setPending((s) => new Set(s).add(uid));
      setActionError(null);
      setNotice(null);
      try {
        if (action.kind === 'approve') {
          await api.callable.approve(ministryId, uid);
          setNotice(`✓ ${nameOf(action.person)} agora é membro de ${ministryName}`);
        } else if (action.kind === 'reject') {
          await api.callable.reject(ministryId, uid);
        } else if (action.kind === 'role') {
          await api.callable.setRole(ministryId, uid, action.role ?? 'member');
        } else {
          await api.callable.removeMember(ministryId, uid);
          focusMembersOnLoad.current = true;
        }
        reload();
      } catch (error) {
        const fallback =
          action.kind === 'approve' || action.kind === 'reject'
            ? 'Não foi possível atualizar. O pedido continua pendente.'
            : 'Não foi possível atualizar. Tente de novo.';
        setActionError({ message: messageFor(error, fallback), retry: action });
      } finally {
        setPending((s) => {
          const next = new Set(s);
          next.delete(uid);
          return next;
        });
      }
    },
    [api, ministryId, ministryName, reload],
  );

  // Menu de ação: fecha com Esc (foco volta ao seletor) e com toque fora dele.
  useEffect(() => {
    if (menuUid === null) return;
    openAnchor.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (focusTrigger: boolean) => {
      if (focusTrigger) triggers.current.get(menuUid)?.focus();
      setMenuUid(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    const onPointer = (event: PointerEvent) => {
      if (!openAnchor.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [menuUid]);

  if (loadError && !data) {
    return (
      <section className="people-screen">
        <Link to="/mais" className="back">
          ‹ Voltar
        </Link>
        <div role="alert" className="error-box">
          <span>{LOAD_ERROR}</span>
          <button type="button" className="btn" onClick={reload}>
            Tentar de novo
          </button>
        </div>
      </section>
    );
  }

  const requests = data?.requests ?? [];
  // A própria pessoa primeiro; as demais por nome (pt-BR).
  const members = [...(data?.members ?? [])].sort(
    (a, b) =>
      Number(b.uid === selfUid) - Number(a.uid === selfUid) ||
      nameOf(a).localeCompare(nameOf(b), 'pt-BR'),
  );
  const adminCount = members.filter((m) => m.role === 'admin').length;

  return (
    <section className="people-screen">
      <Link to="/mais" className="back">
        ‹ Voltar
      </Link>
      <header>
        <p className="section-eyebrow">{ministryName}</p>
        <h2 className="mn-section-title">Pessoas</h2>
      </header>

      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {loadError && data && (
        <div role="alert" className="error-box">
          <span>{LOAD_ERROR}</span>
          <button type="button" className="btn" onClick={reload}>
            Tentar de novo
          </button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="error-box">
          <span>{actionError.message}</span>
          <button type="button" className="btn" onClick={() => void run(actionError.retry)}>
            Tentar de novo
          </button>
        </div>
      )}

      <div className="people-section-head">
        <h3 className="mn-section-title">Pedidos pendentes</h3>
        {data && <span className="mn-status-pill">{requests.length}</span>}
      </div>
      {!data ? (
        <Skeleton />
      ) : requests.length === 0 ? (
        <div className="empty-card">
          <p className="empty-card-title">Nenhum pedido pendente</p>
          <p className="empty-card-text">Quando alguém pedir para entrar, o pedido aparece aqui.</p>
        </div>
      ) : (
        <ul className="request-list">
          {requests.map((person) => {
            const name = nameOf(person);
            const busy = pending.has(person.uid);
            const when = requestedOn(person.createdAt);
            return (
              <li key={person.uid} className="request-card">
                <div className="request-card-head">
                  <span className="person-row-avatar" aria-hidden="true">
                    {initialsOf(name)}
                  </span>
                  <div className="request-card-text">
                    <span className="person-row-name">{name}</span>
                    {person.email && <span className="person-row-email">{person.email}</span>}
                    {when && <span className="request-card-meta">{when}</span>}
                  </div>
                </div>
                <div className="request-card-actions">
                  <button
                    type="button"
                    className="request-card-decline"
                    aria-label={`Recusar ${name}`}
                    disabled={busy}
                    onClick={() => void run({ kind: 'reject', person })}
                  >
                    Recusar
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary request-card-approve"
                    aria-label={`Aprovar ${name}`}
                    disabled={busy}
                    onClick={() => void run({ kind: 'approve', person })}
                  >
                    Aprovar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data && (
        <>
          <div className="people-section-head">
            <h3 className="mn-section-title" ref={membersHeading} tabIndex={-1}>
              Membros
            </h3>
            <span className="section-count">{members.length}</span>
          </div>
          <ul className="person-list">
            {members.map((person) => {
              const name = nameOf(person);
              const isSelf = person.uid === selfUid;
              const lastAdmin = person.role === 'admin' && adminCount === 1;
              const locked = isSelf || (lastAdmin && !appAdminView);
              const admin = person.role === 'admin';
              const busy = pending.has(person.uid);
              const open = menuUid === person.uid && !locked;
              const roleLabel = ROLE_LABEL[person.role ?? 'member'];
              return (
                <li
                  key={person.uid}
                  className="person-menu-anchor"
                  ref={open ? openAnchor : undefined}
                >
                  <div className="person-row">
                    <span
                      className={`person-row-avatar${isSelf ? ' person-row-avatar--self' : ''}`}
                      aria-hidden="true"
                    >
                      {initialsOf(name)}
                    </span>
                    <div className="person-row-text">
                      <span className="person-row-name">
                        {name}
                        {isSelf && <span className="person-row-you"> (você)</span>}
                      </span>
                      {person.email && <span className="person-row-email">{person.email}</span>}
                    </div>
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) triggers.current.set(person.uid, el);
                        else triggers.current.delete(person.uid);
                      }}
                      className={[
                        'mn-role-select',
                        locked ? 'mn-role-select--disabled' : '',
                        admin && !locked ? 'mn-role-select--active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-label={`Papel de ${name}: ${roleLabel}. Alterar`}
                      aria-haspopup={locked ? undefined : 'menu'}
                      aria-expanded={locked ? undefined : open}
                      aria-disabled={locked || busy || undefined}
                      onClick={() => {
                        if (locked || busy) return;
                        setMenuUid(open ? null : person.uid);
                      }}
                    >
                      {roleLabel}
                      {!locked && (
                        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                          <path
                            d="M3 5.5 7 9.5 11 5.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.6"
                          />
                        </svg>
                      )}
                    </button>
                  </div>
                  {open && (
                    <div role="menu" className="action-menu">
                      <button
                        type="button"
                        role="menuitem"
                        className="action-menu-item"
                        onClick={() => {
                          // O menu some: o foco volta para o seletor desta linha.
                          triggers.current.get(person.uid)?.focus();
                          setMenuUid(null);
                          void run({ kind: 'role', person, role: admin ? 'member' : 'admin' });
                        }}
                      >
                        {admin ? 'Tornar membro' : 'Tornar admin'}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="action-menu-item action-menu-item--danger"
                        onClick={() => {
                          const opener = triggers.current.get(person.uid) ?? null;
                          setMenuUid(null);
                          setConfirmRemove({ person, opener });
                        }}
                      >
                        Remover do ministério
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="people-note">{LAST_ADMIN_NOTE}</p>
        </>
      )}

      {confirmRemove && (
        <ConfirmDialog
          title={`Remover ${nameOf(confirmRemove.person)} de ${ministryName}?`}
          confirmLabel="Remover"
          busy={false}
          error={null}
          opener={confirmRemove.opener}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => {
            const { person } = confirmRemove;
            setConfirmRemove(null);
            void run({ kind: 'remove', person });
          }}
        >
          Ele deixa de ver os repertórios e de receber os avisos da {ministryName}. Para voltar,
          precisa pedir de novo.
        </ConfirmDialog>
      )}
    </section>
  );
}

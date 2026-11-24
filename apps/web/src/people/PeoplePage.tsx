import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { MinistryRole } from '../auth/useAuth';
import { messageFor } from '../ministries/callable';
import type { MinistriesApi, PersonRow } from '../ministries/ministriesApi';
import { initialsOf } from '../ui/initials';
import { useFocusTrap } from '../viewer/useFocusTrap';

export interface PeoplePageProps {
  api: MinistriesApi;
  ministryId: string;
  ministryName: string;
  /** Visão do admin do ministério: a própria linha vira "(você)" e não pode ser alterada. */
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

function RemoveDialog({
  person,
  ministryName,
  opener,
  onCancel,
  onConfirm,
}: {
  person: PersonRow;
  ministryName: string;
  opener: HTMLElement | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const textId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useFocusTrap(rootRef, { onEscape: onCancel, opener });

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const name = nameOf(person);
  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={rootRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        className="dialog"
      >
        <h3 id={titleId} className="dialog-title">
          Remover {name} de {ministryName}?
        </h3>
        <p id={textId} className="people-dialog-text">
          Ele deixa de ver os repertórios e de receber os avisos da {ministryName}. Para voltar,
          precisa pedir de novo.
        </p>
        <div className="sheet-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={onCancel}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            Remover
          </button>
        </div>
      </div>
    </div>
  );
}

/** Pessoas do ministério (tela 41): pedidos pendentes e membros, com as ações do admin. */
export function PeoplePage({
  api,
  ministryId,
  ministryName,
  selfUid,
  appAdminView,
}: PeoplePageProps) {
  const [data, setData] = useState<{ requests: PersonRow[]; members: PersonRow[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<{ message: string; retry: Action } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [menuUid, setMenuUid] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{
    person: PersonRow;
    opener: HTMLElement | null;
  } | null>(null);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const openAnchor = useRef<HTMLLIElement | null>(null);

  // `attempt` sobe para reler as listas (depois de uma ação ou em "Tentar de novo").
  const [attempt, setAttempt] = useState(0);
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

  const run = useCallback(
    async (action: Action) => {
      setPendingUid(action.person.uid);
      setActionError(null);
      setNotice(null);
      try {
        if (action.kind === 'approve') {
          await api.callable.approve(ministryId, action.person.uid);
          setNotice(`✓ ${nameOf(action.person)} agora é membro de ${ministryName}`);
        } else if (action.kind === 'reject') {
          await api.callable.reject(ministryId, action.person.uid);
        } else if (action.kind === 'role') {
          await api.callable.setRole(ministryId, action.person.uid, action.role ?? 'member');
        } else {
          await api.callable.removeMember(ministryId, action.person.uid);
        }
        reload();
      } catch (error) {
        const fallback =
          action.kind === 'approve' || action.kind === 'reject'
            ? 'Não foi possível atualizar. O pedido continua pendente.'
            : 'Não foi possível atualizar. Tente de novo.';
        setActionError({ message: messageFor(error, fallback), retry: action });
      } finally {
        setPendingUid(null);
      }
    },
    [api, ministryId, ministryName, reload],
  );

  // Menu de ação: fecha com Esc (foco volta ao seletor) e com toque fora dele.
  useEffect(() => {
    if (menuUid === null) return;
    openAnchor.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const closeTo = (focusTrigger: boolean) => {
      if (focusTrigger) triggers.current.get(menuUid)?.focus();
      setMenuUid(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeTo(true);
    };
    const onPointer = (event: PointerEvent) => {
      if (!openAnchor.current?.contains(event.target as Node)) closeTo(false);
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
  const members = data?.members ?? [];
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
            const busy = pendingUid === person.uid;
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
                    aria-busy={busy}
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
            <h3 className="mn-section-title">Membros</h3>
            <span className="section-count">{members.length}</span>
          </div>
          <ul className="person-list">
            {members.map((person) => {
              const name = nameOf(person);
              const isSelf = person.uid === selfUid;
              const lastAdmin = person.role === 'admin' && adminCount === 1;
              const locked = isSelf || (lastAdmin && !appAdminView);
              const admin = person.role === 'admin';
              const busy = pendingUid === person.uid;
              const open = menuUid === person.uid;
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
                          setMenuUid(null);
                          void run({
                            kind: 'role',
                            person,
                            role: admin ? 'member' : 'admin',
                          });
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
        <RemoveDialog
          person={confirmRemove.person}
          ministryName={ministryName}
          opener={confirmRemove.opener}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => {
            const { person } = confirmRemove;
            setConfirmRemove(null);
            void run({ kind: 'remove', person });
          }}
        />
      )}
    </section>
  );
}

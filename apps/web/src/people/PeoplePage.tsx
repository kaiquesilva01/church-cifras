import { useEffect, useState } from 'react';
import { ROLE_LABELS, ROLES, type Role } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import type { PeopleApi, PersonRow } from './peopleApi';

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return '•••';
  return `${email.charAt(0)}•••${email.slice(at)}`;
}

const ERROR_MESSAGES: Record<string, string> = {
  'functions/not-found': 'Essa pessoa não existe mais.',
  'functions/permission-denied': 'Você não tem permissão para alterar papéis.',
  'functions/failed-precondition': 'Você não pode alterar o próprio papel.',
};
const DEFAULT_ERROR = 'Não foi possível alterar o papel.';

function errorMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return (typeof code === 'string' && ERROR_MESSAGES[code]) || DEFAULT_ERROR;
}

type Feedback = { kind: 'ok' | 'error'; text: string } | null;

export function PeoplePage({ api }: { api: PeopleApi }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let active = true;
    api
      .listUsers()
      .then((list) => {
        if (active) setRows(list);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [api]);

  const updateRole = (uid: string, role: Role) =>
    setRows((current) => current?.map((r) => (r.uid === uid ? { ...r, role } : r)) ?? null);

  const change = async (person: PersonRow, role: Role) => {
    const previous = person.role;
    setFeedback(null);
    setPending((s) => new Set(s).add(person.uid));
    updateRole(person.uid, role);
    try {
      await api.setRole(person.uid, role);
      setFeedback({ kind: 'ok', text: 'Papel atualizado' });
    } catch (error) {
      console.error('Falha ao alterar o papel', error);
      updateRole(person.uid, previous);
      setFeedback({ kind: 'error', text: errorMessage(error) });
    } finally {
      setPending((s) => {
        const next = new Set(s);
        next.delete(person.uid);
        return next;
      });
    }
  };

  let body;
  if (loadError) {
    body = (
      <p role="alert" className="error">
        Não foi possível carregar as pessoas.
      </p>
    );
  } else if (!rows) {
    body = <p className="status">Carregando…</p>;
  } else if (rows.length === 0) {
    body = <p className="muted">Ninguém entrou ainda.</p>;
  } else {
    body = (
      <table className="people">
        <thead>
          <tr>
            <th scope="col">Nome</th>
            <th scope="col">E-mail</th>
            <th scope="col">Papel</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const own = p.uid === user?.uid;
            const name = p.displayName || maskEmail(p.email);
            return (
              <tr key={p.uid}>
                <td data-label="Nome">
                  <span>
                    {name}
                    {own && <span className="muted"> (você)</span>}
                  </span>
                </td>
                <td data-label="E-mail">{maskEmail(p.email)}</td>
                <td data-label="Papel">
                  <select
                    className="role-select"
                    aria-label={`Papel de ${name}`}
                    value={p.role}
                    disabled={own || pending.has(p.uid)}
                    onChange={(e) => void change(p, e.target.value as Role)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <section className="card">
      <h2>Pessoas</h2>
      <div role="status" className="success">
        {feedback?.kind === 'ok' && feedback.text}
      </div>
      {feedback?.kind === 'error' && (
        <p role="alert" className="error">
          {feedback.text}
        </p>
      )}
      {body}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { ROLE_LABELS, type Role } from '../auth/roles';
import { useAuth } from '../auth/useAuth';
import type { PeopleApi, PersonRow } from './peopleApi';

const ROLE_OPTIONS = Object.keys(ROLE_LABELS) as Role[];

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return email;
  return `${email.charAt(0)}•••${email.slice(at)}`;
}

type Feedback = { kind: 'ok' | 'error'; text: string } | null;

export function PeoplePage({ api }: { api: PeopleApi }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
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
    updateRole(person.uid, role);
    try {
      await api.setRole(person.uid, role);
      setFeedback({ kind: 'ok', text: 'Papel atualizado' });
    } catch {
      updateRole(person.uid, previous);
      setFeedback({ kind: 'error', text: 'Não foi possível alterar o papel.' });
    }
  };

  let body;
  if (loadError) {
    body = <p className="error">Não foi possível carregar as pessoas.</p>;
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
            return (
              <tr key={p.uid}>
                <td data-label="Nome">
                  <span>
                    {p.displayName} {own && <span className="muted">(você)</span>}
                  </span>
                </td>
                <td data-label="E-mail">{maskEmail(p.email)}</td>
                <td data-label="Papel">
                  <select
                    className="role-select"
                    aria-label={`Papel de ${p.displayName}`}
                    value={p.role}
                    disabled={own}
                    onChange={(e) => void change(p, e.target.value as Role)}
                  >
                    {ROLE_OPTIONS.map((r) => (
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
      <div role="status" className={feedback?.kind === 'error' ? 'error' : 'success'}>
        {feedback?.text}
      </div>
      {body}
    </section>
  );
}

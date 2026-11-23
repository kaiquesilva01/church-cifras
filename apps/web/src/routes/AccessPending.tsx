import { useState } from 'react';
import { useAuth } from '../auth/useAuth';

/** Tela única de quem está logado mas ainda não foi liberado por um admin (#126). */
export function AccessPending() {
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  function exit() {
    setBusy(true);
    setFailed(false);
    signOut().catch(() => {
      setBusy(false);
      setFailed(true);
    });
  }

  return (
    <main className="access-screen">
      <span className="access-mark" aria-hidden="true">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </span>
      <h1 className="access-title">Acesso ainda não liberado</h1>
      <p className="access-text">
        Peça a um admin do ministério para liberar a sua conta. Depois que ele liberar, é só entrar
        de novo.
      </p>
      <div className="access-card">
        <span className="access-card-label">Conta</span>
        <span className="access-card-email">{user?.email ?? ''}</span>
      </div>
      <button type="button" className="access-exit" onClick={exit} disabled={busy}>
        Sair
      </button>
      {failed && (
        <p role="alert" className="error">
          Não foi possível sair. Tente de novo.
        </p>
      )}
    </main>
  );
}

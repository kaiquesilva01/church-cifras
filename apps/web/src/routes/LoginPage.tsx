import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { returnPathFrom } from './returnPath';

export function LoginPage() {
  const { status, signIn, prepareSignIn } = useAuth();
  const location = useLocation();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Warm the popup resolver before the tap so signInWithPopup can window.open inside the gesture.
  useEffect(() => {
    void prepareSignIn();
  }, [prepareSignIn]);

  if (status === 'loading')
    return (
      <p role="status" className="status">
        Carregando…
      </p>
    );
  if (status === 'signed-in') return <Navigate to={returnPathFrom(location.state)} replace />;

  const handleClick = () => {
    setFailed(false);
    setBusy(true);
    signIn()
      .catch((error: unknown) => {
        const code = (error as { code?: unknown } | null)?.code;
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
        setFailed(true);
      })
      .finally(() => setBusy(false));
  };

  return (
    <main className="login">
      <span className="login-mark" aria-hidden="true">
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      </span>
      <h1>Cifras · Louvor</h1>
      <p className="muted">Acervo de cifras do ministério de louvor</p>
      <button type="button" className="btn btn-primary" onClick={handleClick} disabled={busy}>
        Entrar com Google
      </button>
      <p className="login-note">
        Quem entra pela primeira vez precisa da liberação de um admin do ministério para ver as
        cifras.
      </p>
      {failed && (
        <p role="alert" className="error">
          Não foi possível entrar. Tente de novo.
        </p>
      )}
    </main>
  );
}

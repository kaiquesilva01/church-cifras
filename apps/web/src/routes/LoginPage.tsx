import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/useAuth';

export function LoginPage() {
  const { status, signIn, prepareSignIn } = useAuth();
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
  if (status === 'signed-in') return <Navigate to="/" replace />;

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
      <h1>Cifras · Louvor</h1>
      <p className="muted">Acervo de cifras do ministério de louvor</p>
      <button type="button" className="btn btn-primary" onClick={handleClick} disabled={busy}>
        Entrar com Google
      </button>
      {failed && (
        <p role="alert" className="error">
          Não foi possível entrar. Tente de novo.
        </p>
      )}
    </main>
  );
}

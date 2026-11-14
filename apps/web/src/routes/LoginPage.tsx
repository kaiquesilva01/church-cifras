import { useState } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/useAuth';

export function LoginPage() {
  const { status, signIn } = useAuth();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

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
      .catch(() => setFailed(true))
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

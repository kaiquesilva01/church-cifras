import { useState } from 'react';
import { useAuth } from '../auth/useAuth';

/** "Sair" das telas de acesso (pendente e erro): desabilita enquanto sai e avisa se falhar. */
export function SignOutButton() {
  const { signOut } = useAuth();
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
    <>
      <button type="button" className="access-exit" onClick={exit} disabled={busy}>
        Sair
      </button>
      {failed && (
        <p role="alert" className="error">
          Não foi possível sair. Tente de novo.
        </p>
      )}
    </>
  );
}

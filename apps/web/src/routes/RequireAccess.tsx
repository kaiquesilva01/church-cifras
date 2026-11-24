import { Outlet } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { AccessPending } from './AccessPending';
import { MinistryLoadError } from './MinistryLoadError';
import { SignOutButton } from './SignOutButton';

/**
 * Layout route entre RequireAuth e os provedores de dados: sem acesso liberado,
 * nenhum provedor, listener ou rota de dados é montado (#126). Falha ao ler o vínculo ou ao
 * sincronizar o claim mostra erro com "Tentar de novo" e "Sair", não "acesso pendente".
 */
export function RequireAccess() {
  const { access, accessFailed } = useAuth();
  if (access === 'checking')
    return (
      <p role="status" className="status">
        Carregando…
      </p>
    );
  if (access === 'blocked')
    return accessFailed ? (
      <main className="access-screen">
        <MinistryLoadError access />
        <SignOutButton />
      </main>
    ) : (
      <AccessPending />
    );
  return <Outlet />;
}

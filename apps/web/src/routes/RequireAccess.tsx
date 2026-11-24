import { Outlet } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { AccessPending } from './AccessPending';
import { MinistryLoadError } from './MinistryLoadError';

/**
 * Layout route entre RequireAuth e os provedores de dados: sem acesso liberado,
 * nenhum provedor, listener ou rota de dados é montado (#126).
 */
export function RequireAccess() {
  const { access, accessFailed } = useAuth();
  if (access === 'checking')
    return (
      <p role="status" className="status">
        Carregando…
      </p>
    );
  if (access === 'blocked') return accessFailed ? <MinistryLoadError access /> : <AccessPending />;
  return <Outlet />;
}

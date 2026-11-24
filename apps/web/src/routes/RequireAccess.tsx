import { Outlet } from 'react-router';
import { useAuth } from '../auth/useAuth';
import type { MinistriesApi } from '../ministries/ministriesApi';
import { EntryPage } from '../ministries/entry/EntryPage';
import { MinistryLoadError } from './MinistryLoadError';
import { SignOutButton } from './SignOutButton';

/**
 * Layout route entre RequireAuth e os provedores de dados: sem acesso liberado,
 * nenhum provedor, listener ou rota de dados é montado (#126). Falha ao ler o vínculo ou ao
 * sincronizar o claim mostra erro com "Tentar de novo" e "Sair", não a entrada.
 */
export function RequireAccess({ api }: { api: MinistriesApi }) {
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
      <EntryPage api={api} />
    );
  return <Outlet />;
}
